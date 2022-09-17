const { assert, expect } = require('chai');
const { getNamedAccounts, deployments, ethers, network } = require('hardhat');
const { developmentChains, networkConfig } = require('../../helper-hardhat-config');

developmentChains.includes(network.name)
  ? describe.skip
  : describe('Raffle', function () {
      let raffle, raffleEntranceFee, deployer;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        raffle = await ethers.getContract('Raffle', deployer);
        raffleEntranceFee = await raffle.getEntranceFee();
      });
      describe('fulfillRandomWords', function () {
        it('works with live chainlink keepers and chainlink VRF, we get a random winner', async function () {
          // Enter the raffle
          const startingTimeStamp = await raffle.getLatestTimestamp();
          const accounts = await ethers.getSigners();

          await new Promise(async (resolve, reject) => {
            // setup the listner before we enter the raffle
            // just in case the blockchain moves really fast
            raffle.once('WinnerPicked', async () => {
              console.log('winnerpicked envent fiiiirrreedd');
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRalleState();
                const winnerEndingBalance = await accounts[0].getBalance();
                const endingTimestamp = await raffle.getLatestTimestamp();

                await expect(raffle.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(raffleState, 0);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(raffleEntranceFee).toString()
                );
                assert(endingTimestamp > startingTimeStamp);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
            // then Enter raffle
            await raffle.enterRaffle({ value: raffleEntranceFee });
            const winnerStartingBalance = await accounts[0].getBalance();
            // This code wont complete until our listner as finish listnening
          });
        });
      });
    });
