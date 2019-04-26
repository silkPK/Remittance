/* eslint-disable new-cap */
/* eslint-disable max-len */
/* eslint-disable one-var */
'use strict';

web3.eth.getTransactionReceiptMined = require('../gistLepretre/getTransactionReceiptMined.js');
web3.eth.expectedExceptionPromise = require('../gistLepretre/expected_exception_testRPC_and_geth.js');

const addEvmFunctions = require('../gistLepretre/evmFunctions.js');
addEvmFunctions(web3);

const {BN, toWei, sha3, soliditySha3, fromAscii} = web3.utils;
const {getBlock, getBalance, getTransaction} = web3.eth;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const duration = {
  seconds: function(value) {
    return value;
  },
  minutes: function(value) {
    return value * this.seconds(60);
  },
  hours: function(value) {
    return value * this.minutes(60);
  },
  days: function(value) {
    return value * this.hours(24);
  },
  weeks: function(value) {
    return value * this.days(7);
  },
  years: function(value) {
    return value * this.days(365);
  },
};

require('chai')
    .use(require('chai-as-promised'))
    .use(require('bn-chai')(BN))
    .should();

const Remittance = artifacts.require('Remittance.sol');

contract('Remittance', (accounts) => {
  const MAX_GAS = '4700000';

  let coinbase, alice, david, carol;
  before('checking accounts', async () => {
    assert.isAtLeast(accounts.length, 5, 'not enough accounts');

    coinbase = await web3.eth.getCoinbase();

    const coinbaseIndex = await accounts.indexOf(coinbase);
    // Remove the coinbase account
    if (coinbaseIndex > -1) {
      accounts.splice(coinbaseIndex, 1);
    }
    [alice, david, carol] = accounts;
  });

  describe('#Remittance()', () => {
    describe('costructor', () => {
      describe('should allowed', () => {
        it('and emit EventRemittanceCreated', async () => {
          const maxFarInTheFuture = duration.years(1);

          const remittanceInstance = await Remittance.new(maxFarInTheFuture, false,
              {from: alice}).should.be.fulfilled;
          const receipt = await web3.eth.getTransactionReceiptMined(remittanceInstance.transactionHash);

          receipt.logs.length.should.be.equal(2);
          const logEventRemittanceCreted = receipt.logs[1];
          logEventRemittanceCreted.topics[0].should.be.equal(sha3('EventRemittanceCreated(address,uint256)'));
        });
      });

      describe('should fail', () => {
        it('if maxFarInTheFuture is 0', async () => {
          const maxFarInTheFuture = 0;

          await web3.eth.expectedExceptionPromise(() => {
            return Remittance.new(maxFarInTheFuture,
                {from: alice});
          }, MAX_GAS);
        });
      });
    });

    describe('Test Remittance Instance methods:', () => {
      let remittanceInstance;

      const allowedPasswords = [
        {code: fromAscii('gwei').padEnd(66, '0'), etherAmount: toWei('0.5', 'ether')},
        {code: fromAscii('After all, tomorrow is another”').padEnd(66, '0'), etherAmount: toWei('100', 'szabo')},
        {code: fromAscii('Do. Or do not. There is no try.').padEnd(66, '0'), etherAmount: toWei('1', 'ether')},
      ];

      let password;
      beforeEach('should deploy Remittance instance', async () => {
        const maxFarInTheFuture = duration.years(1);

        remittanceInstance = await Remittance.new(maxFarInTheFuture, false,
            {from: alice}).should.be.fulfilled;
        password = await remittanceInstance.oneTimePassword(allowedPasswords[0].code, carol);
      });

      describe('#oneTimePassword()', () => {
        describe('allowed', () => {
          allowedPasswords.forEach((values) => {
            it(`to use code= ${values.code}`, async () => {
              const otp1 = await remittanceInstance.oneTimePassword(values.code, carol,
                  {from: alice});

              otp1.should.be.equal(soliditySha3(values.code, carol));
            });
          });
        });

        describe('fail', () => {
          it('if called with code null ', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.oneTimePassword(fromAscii('').padEnd(66, '0'), carol,
                  {from: alice});
            }, MAX_GAS);
          });

          it('if called with exchanger address = address(0)', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.oneTimePassword(allowedPasswords[0].code, ZERO_ADDRESS,
                  {from: alice});
            }, MAX_GAS);
          });
        });
      });

      describe('#depositFund()', () => {
        describe('allowed', () => {
          it('if called with valid code and amount ', async () => {
            const latestBlock = await getBlock('latest');
            const releaseTime = latestBlock.timestamp + duration.hours(1);
            
            const result = await remittanceInstance.depositFund(password, duration.hours(1),
                {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS});

            result.logs[0].event.should.be.equal('EventDepositFund');
            result.logs[0].args.caller.should.be.equal(alice);
            result.logs[0].args.password.should.be.equal(soliditySha3(allowedPasswords[0].code, carol));
            result.logs[0].args.releaseTime.should.be.eq.BN(releaseTime);
            result.logs[0].args.etherAmount.should.be.eq.BN(allowedPasswords[0].etherAmount);
          });

          it('if deposited from any user ', async () => {
            const latestBlock = await getBlock('latest');
            const releaseTime = latestBlock.timestamp + duration.hours(1);
            const result = await remittanceInstance.depositFund(password, duration.hours(1),
                {from: david, value: allowedPasswords[0].etherAmount, gas: MAX_GAS});

            result.logs[0].event.should.be.equal('EventDepositFund');
            result.logs[0].args.caller.should.be.equal(david);
            result.logs[0].args.password.should.be.equal(soliditySha3(allowedPasswords[0].code, carol));
            result.logs[0].args.releaseTime.should.be.eq.BN(releaseTime);
            result.logs[0].args.etherAmount.should.be.eq.BN(allowedPasswords[0].etherAmount);
          });
        });

        describe('fail', () => {
          it('if called with invalid deadline ', async () => {
            const seconds = [0, duration.years(2)];

            seconds.forEach(async (deadine) => {
              await web3.eth.expectedExceptionPromise(() => {
                return remittanceInstance.depositFund(password, deadine,
                    {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS});
              }, MAX_GAS);
            });
          });

          it.skip('if called with sender = address(0)', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.depositFund(password, duration.minutes(2),
                  {from: ZERO_ADDRESS, value: allowedPasswords[0].etherAmount, gas: MAX_GAS});
            }, MAX_GAS);
          });

          it('if called with amount = 0', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.depositFund(password, duration.minutes(2),
                  {from: alice, value: 0, gas: MAX_GAS});
            }, MAX_GAS);
          });

          it('if called with password already deposited', async () => {
            await remittanceInstance.depositFund(password, duration.minutes(2),
                {from: alice, value: allowedPasswords[1].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;

            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.depositFund(password, duration.minutes(2),
                  {from: alice, value: 0, gas: MAX_GAS});
            }, MAX_GAS);
          });

          it('if called when stopped', async () => {
            await remittanceInstance.stop()
                .should.be.fulfilled;

            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.depositFund(password, duration.hours(1),
                  {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS});
            }, MAX_GAS);
          });
        });
      });

      describe('#withdrawRemittance()', () => {
        describe('allowed', () => {
          beforeEach('should deposit fund', async () => {
            await remittanceInstance.depositFund(password, duration.hours(1),
                {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;
          });

          it('if called in time with valid data and emit Event ', async () => {
            const result = await remittanceInstance.withdrawRemittance(allowedPasswords[0].code,
                {from: carol});

            result.logs[0].event.should.be.equal('EventWithdrawRemittance');
            result.logs[0].args.caller.should.be.equal(carol);
            result.logs[0].args.payer.should.be.equal(alice);
            result.logs[0].args.etherAmount.should.be.eq.BN(allowedPasswords[0].etherAmount);
          });

          it('if called in time and caller receive amount ', async () => {
            const preCarolBalance = new BN(await getBalance(carol));

            const result = await remittanceInstance.withdrawRemittance(allowedPasswords[0].code,
                {from: carol}).should.be.fulfilled;

            const gasUsedWithdrawRemittance = new BN(result.receipt.gasUsed);
            const txObj = await getTransaction(result.tx);
            const gasPriceWithdrawRemittance = new BN(txObj.gasPrice);
            const totalGas = gasPriceWithdrawRemittance.mul(gasUsedWithdrawRemittance);
            const postCarolBalance = new BN(await getBalance(carol));

            postCarolBalance.should.be.eq.BN((preCarolBalance.add(new BN(allowedPasswords[0].etherAmount))).sub(totalGas));
          });

          it('if called not in time', async () => {
            await web3.evm.increaseTime(duration.hours(2));
            await remittanceInstance.withdrawRemittance(allowedPasswords[0].code,
                {from: carol}).should.be.fulfilled;
          });
        });

        describe('fail', () => {
          let password1;
          beforeEach('before deposit fund', async () => {
            await remittanceInstance.depositFund(password, duration.seconds(10),
                {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;

            password1 = await remittanceInstance.oneTimePassword(allowedPasswords[1].code, alice);
            await remittanceInstance.depositFund(password1, duration.seconds(10),
                {from: alice, value: allowedPasswords[1].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;
          });

          it('if called with invalid password', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.withdrawRemittance(allowedPasswords[1].code,
                  {from: carol});
            }, MAX_GAS);
          });

          it('if called from invalid exchanger', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.withdrawRemittance(allowedPasswords[0].code,
                  {from: david});
            }, MAX_GAS);
          });

          it('if called when stopped', async () => {
            await remittanceInstance.stop()
                .should.be.fulfilled;

            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.withdrawRemittance(allowedPasswords[0].code,
                  {from: carol});
            }, MAX_GAS);
          });
        });
      });

      describe('#cancelRemittance()', () => {
        describe('allowed', () => {
          let password1;
          beforeEach('should deposit fund', async () => {
            await remittanceInstance.depositFund(password, duration.seconds(10),
                {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;

            password1 = await remittanceInstance.oneTimePassword(allowedPasswords[1].code, carol);
            await remittanceInstance.depositFund(password1, duration.seconds(10),
                {from: alice, value: allowedPasswords[1].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;
          });

          it('if called in time with valid data and emit Event ', async () => {
            await web3.evm.increaseTime(duration.seconds(15));
            const result = await remittanceInstance.cancelRemittance(password,
                {from: alice});

            result.logs[0].event.should.be.equal('EventCancelRemittance');
            result.logs[0].args.caller.should.be.equal(alice);
            result.logs[0].args.password.should.be.equal(password);
            result.logs[0].args.etherDrop.should.be.eq.BN(allowedPasswords[0].etherAmount);
          });

          it('if called in time and caller receive amount ', async () => {
            const preAliceBalance = new BN(await getBalance(alice));

            await web3.evm.increaseTime(duration.seconds(15));
            const result = await remittanceInstance.cancelRemittance(password,
                {from: alice}).should.be.fulfilled;

            const gasUsedCancelRemittance = new BN(result.receipt.gasUsed);
            const txObj = await getTransaction(result.tx);
            const gasPriceCancelRemittance = new BN(txObj.gasPrice);
            const totalGas = gasPriceCancelRemittance.mul(gasUsedCancelRemittance);
            const postAliceBalance = new BN(await getBalance(alice));

            postAliceBalance.should.be.eq.BN((preAliceBalance.add(new BN(allowedPasswords[0].etherAmount))).sub(totalGas));

            const postBalance = new BN(await getBalance(remittanceInstance.address));
            postBalance.should.be.eq.BN(new BN(allowedPasswords[1].etherAmount));
          });
        });

        describe('fail', () => {
          let password1;
          beforeEach('before deposit fund', async () => {
            await remittanceInstance.depositFund(password, duration.seconds(10),
                {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;

            password1 = await remittanceInstance.oneTimePassword(allowedPasswords[1].code, carol);
          });

          it('if called too early', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.cancelRemittance(password, {from: alice});
            }, MAX_GAS);
          });

          it('if called with invalid password', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.cancelRemittance(password1, {from: alice});
            }, MAX_GAS);
          });

          it('if called from invalid address', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.cancelRemittance(password, {from: carol});
            }, MAX_GAS);
          });

          it('if called when stopped', async () => {
            await remittanceInstance.stop()
                .should.be.fulfilled;

            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.cancelRemittance(password, {from: alice});
            }, MAX_GAS);
          });
        });
      });

      describe('#kill()', () => {
        describe('allowed', () => {
          beforeEach('should deposit fund', async () => {
            await remittanceInstance.depositFund(password, duration.hours(1),
                {from: alice, value: allowedPasswords[0].etherAmount, gas: MAX_GAS})
                .should.be.fulfilled;
          });

          it('if called from owner', async () => {
            const result = await remittanceInstance.kill({from: alice});

            result.logs[0].event.should.be.equal('EventContractKilled');
            result.logs[0].args.caller.should.be.equal(alice);
            result.logs[0].args.balance.should.be.eq.BN(allowedPasswords[0].etherAmount);
          });

          it('from owner that receive the balance', async () => {
            const preBalance = new BN(await getBalance(alice));

            const result = await remittanceInstance.kill({from: alice});

            const gasUsedKill = new BN(result.receipt.gasUsed);
            const txObj = await getTransaction(result.tx);
            const gasPriceKill = new BN(txObj.gasPrice);
            const totalGas = gasPriceKill.mul(gasUsedKill);
            const postBalance = new BN(await getBalance(alice));
            postBalance.should.be.eq.BN((preBalance.add(new BN(allowedPasswords[0].etherAmount))).sub(totalGas));
          });
        });

        describe('fail', () => {
          it('if called from non owner', async () => {
            await web3.eth.expectedExceptionPromise(() => {
              return remittanceInstance.kill({from: carol, gas: MAX_GAS});
            }, MAX_GAS);
          });
        });
      });
    });
  });
});
