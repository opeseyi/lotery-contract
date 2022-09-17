const { assert, expect } = require('chai');
const { getNamedAccounts, deployments, ethers, network } = require('hardhat');
const { developmentChains, networkConfig } = require('../../helper-hardhat-config');

!developmentChains.includes(network.name)
  ? describe.skip
  : describe('Raffle', function () {
      let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(['all']);
        raffle = await ethers.getContract('Raffle', deployer);
        vrfCoordinatorV2Mock = await ethers.getContract('VRFCoordinatorV2Mock', deployer);
        raffleEntranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe('Constructor', function () {
        it('initializes the raffle correctly', async function () {
          //   ideally we make test with 1 assert/expect per "it"
          const raffleState = await raffle.getRalleState();
          assert.equal(raffleState.toString(), '0');
          assert.equal(interval.toString(), networkConfig[chainId]['interval']);
        });
      });

      describe('enterRaffle', function () {
        it('revert when you dont pay enough', async function () {
          await expect(raffle.enterRaffle()).to.be.revertedWith('Raffle__NotEnoughETHEntered');
        });
        it('records players when they enter', async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          const playerFromContract = await raffle.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });
        it('emit events on enter', async function () {
          await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
            raffle,
            'RaffleEnter'
          );
        });
        it('doesnt allow entrance when raffle is calculating', async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.send('evm_mine', []);
          //   pretending to be a chainlink keeper
          await raffle.performUpkeep([]);
          await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
            'Raffle__NotOpen'
          );
        });
      });
      describe('checkUpkeep', function () {
        it('returns false if people havent sent any ETH', async function () {
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.send('evm_mine', []);
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });
        it('returns false if raffle isnt open', async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.send('evm_mine', []);
          await raffle.performUpkeep([]);
          const raffleState = await raffle.getRalleState();
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert.equal(raffleState.toString(), '1');
          assert.equal(upkeepNeeded, false);
        });
        it("returns false if enough time hasn't passed", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() - 1]);
          await network.provider.send('evm_mine', []);
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert.equal(!upkeepNeeded, false);
        });
        it('returns true if enough time has passed, has players, eth, and is open', async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.send('evm_mine', []);
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded);
        });
      });
      describe('performUpkeep', function () {
        it('can only run if checkUpkeep is true', async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.send('evm_mine', []);
          const tx = await raffle.performUpkeep([]);
          assert(tx);
        });
        it('revert when checkUpkeep is false', async function () {
          await expect(raffle.performUpkeep([])).to.be.revertedWith('Raffle__UpkeepNotNeeded');
        });
        it('updates the raffle state, emits and events, and calls the vrf coordinator', async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.send('evm_mine', []);
          const txResponse = await raffle.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.events[1].args.requestId;
          console.log(requestId);
          const raffleState = await raffle.getRalleState();
          assert(requestId.toNumber() > 0);
          assert(raffleState.toString() == '1');
        });
      });
      describe('fulfillRandomWords', function () {
        beforeEach(async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
          await network.provider.send('evm_mine', []);
        });
        it('can only be called after performUpkeep', async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.revertedWith('nonexistent request');
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
          ).to.be.revertedWith('nonexistent request');
        });
        // big test
        it('picks a winner, resets the lottery, and send money', async function () {
          const additionalEntrance = 3;
          const startingAccountIndex = 1;
          const accounts = await ethers.getSigners();
          for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrance; i++) {
            const accountCountedRaffle = raffle.connect(accounts[i]);
            await accountCountedRaffle.enterRaffle({ value: raffleEntranceFee });
          }
          const startingTimeStamp = await raffle.getLatestTimestamp();
          //   performUpkeep(mock be chainlink keeper )
          // fulfillRandomWords(mock being the chainlink VRF)
          // we willl have to wait for the fulfillRandomWords to be called
          await new Promise(async (resolve, reject) => {
            raffle.once('WinnerPicked', async () => {
              console.log('Found the event');
              try {
                const recentWinner = await raffle.getRecentWinner();
                console.log(recentWinner);
                const raffleState = await raffle.getRalleState();
                const endingTimestamp = await raffle.getLatestTimestamp();
                const numPlayers = await raffle.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance();

                assert.equal(numPlayers.toString(), '0');
                assert.equal(raffleState.toString(), '0');
                assert(endingTimestamp > startingTimeStamp);

                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStatingBalance.add(
                    raffleEntranceFee.mul(additionalEntrance).add(raffleEntranceFee).toString()
                  )
                );
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            // setting up the listner
            // beloww we will fire the event and the listner will pick it up, and resolve
            const tx = await raffle.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const winnerStatingBalance = await accounts[1].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              raffle.address
            );
          });
        });
      });
    });
