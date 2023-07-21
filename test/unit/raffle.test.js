const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkconfig } = require("../../helper-hardhat-config.js");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
	? describe.skip
	: describe("Raffle unit test", async function () {
			let raffle, vrfcoordinatorMock, deployer, raffleEntranceFee, interval;
			const chainId = network.config.chainId;
			beforeEach(async function () {
				deployer = (await getNamedAccounts()).deployer;
				await deployments.fixture(["all"]);
				raffle = await ethers.getContract("Raffle", deployer);
				vrfcoordinatorMock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
				raffleEntranceFee = await raffle.getEntranceFee();
				interval = await raffle.getInterval();
			});

			describe("constructor", async function () {
				it("Initializes the raffle correctly", async function () {
					//Ideally we only use assert only once in one "it".
					const raffleState = await raffle.getRaffleState();
					const interval = await raffle.getInterval();
					assert.equal(raffleState.toString(), "0");
					assert.equal(interval.toString(), networkconfig[chainId]["interval"]);
				});
			});

			describe("EnterToRaffle", async function () {
				it("Reverts if not paying enough", async function () {
					await expect(raffle.EnterToLottery()).to.be.revertedWith(
						"Raffle__NotEnoughEth"
					);
				});
				it("Records players when they enter", async () => {
					await raffle.EnterToLottery({ value: raffleEntranceFee });
					const playerfromContract = await raffle.getPlayers(0);
					assert.equal(playerfromContract, deployer);
				});
				it("emits event on enter", async function () {
					await expect(raffle.EnterToLottery({ value: raffleEntranceFee })).to.emit(
						raffle,
						"RaffleEnter"
					);
				});

				it("doesn't allows raffle to enter when it's in calculating", async function () {
					await raffle.EnterToLottery({ value: raffleEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					// here we pretended that raffle is in calculating state, now we can do our testing.
					await raffle.performUpkeep([]);
					await expect(
						raffle.EnterToLottery({ value: raffleEntranceFee })
					).to.be.revertedWith("Raffle__NotOpen");
				});
			});

			describe("checkUpkeep", async function () {
				it("returns false if people not sending any ETHs", async function () {
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
					assert(!upkeepNeeded);
				});
				it("returns false if raffle isn't open", async function () {
					await raffle.EnterToLottery({ value: raffleEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					await raffle.performUpkeep([]);
					const raffleState = await raffle.getRaffleState();
					const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
					assert.equal(raffleState.toString(), "1");
					assert.equal(upkeepNeeded, false);
				});
				it("returns false if time isn't passed", async function () {
					await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]);
					await network.provider.send("evm_mine", []);
					const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
					assert(!upkeepNeeded);
				});
				it("returns true if enough time has passed, hasPlayers, eth, isOpen", async function () {
					await raffle.EnterToLottery({ value: raffleEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
					assert(upkeepNeeded);
				});
			});

			describe("performUpkeep", function () {
				it("raffle is calculating, only if checkUpkeep returns true", async function () {
					await raffle.EnterToLottery({ value: raffleEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					const tx = await raffle.performUpkeep([]);
					assert(tx);
					const raffleState = await raffle.getRaffleState();
					assert.equal(raffleState.toString(), "1");
				});

				it("going further only when checkUpkeep is true", async function () {
					await expect(raffle.performUpkeep([])).to.be.revertedWith(
						"Raffle__upkeepNotNeeded"
					);
				});

				it("updates emits and event, calls the vrfcoordinator", async function () {
					await raffle.EnterToLottery({ value: raffleEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					const txresponse = await raffle.performUpkeep([]);
					const txreceipt = await txresponse.wait(1);
					const requestId = await txreceipt.events[1].args.requestId;
					assert(requestId.toNumber() > 0);
				});
				// it("emits an randomRequestWinner event", async function () {
				// 	await expect(raffle.performUpkeep([])).to.emit(raffle, "RequestedRandomWinner");
				// });
			});

			describe("fullfillRandomWords", function () {
				beforeEach(async function () {
					await raffle.EnterToLottery({ value: raffleEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
				});
				it("can only be called if performUpkeep", async function () {
					await expect(
						vrfcoordinatorMock.fulfillRandomWords(0, raffle.address)
					).to.be.revertedWith("nonexistent request");
					await expect(
						vrfcoordinatorMock.fulfillRandomWords(1, raffle.address)
					).to.be.revertedWith("nonexistent request");
				});
				it("picks the winner, resets the lottery and sends money", async function () {
					const additionalEntrants = 3;
					const startingIndex = 1; // deployer at 0
					const accounts = await ethers.getSigners();
					for (let i = startingIndex; i <= additionalEntrants; ++i) {
						const accountConnectedRaffle = await raffle.connect(accounts[i]);
						await accountConnectedRaffle.EnterToLottery({ value: raffleEntranceFee });
					}

					const startingTimeStamp = await raffle.getLastTimeStamp();

					//performUpkeep (mock being chainlink keepers)
					// fulfillRandomWords(mock being chainlink vrf)
					//We will have to wait for the fulfillRandomWords to be called

					await new Promise(async (resolve, reject) => {
						await raffle.once("WinnerPicked", async () => {
							console.log("Found the event!");
							try {
								const recentWinner = await raffle.getRecentWinner();
								console.log(recentWinner);
								const winnerEndingBalance = await accounts[1].getBalance();
								const raffleState = await raffle.getRaffleState();
								const numPlayers = await raffle.getNumberOfPlayers();
								const endingTimeStamp = await raffle.getLastTimeStamp();
								assert.equal(raffleState.toString(), "0");
								assert.equal(numPlayers.toNumber(), 0);
								assert(endingTimeStamp > startingTimeStamp);
								assert.equal(
									winnerEndingBalance.toString(),
									winnerStartingBalance
										.add(
											raffleEntranceFee
												.mul(additionalEntrants)
												.add(raffleEntranceFee)
										)
										.toString()
								);
							} catch (e) {
								reject(e);
							}
							resolve();
						});
						// Setting up the listener
						// below, we will fire the event, the listener will pick it up and resolve
						const tx = await raffle.performUpkeep([]);
						const txReceipt = await tx.wait(1);
						const winnerStartingBalance = await accounts[1].getBalance();
						await vrfcoordinatorMock.fulfillRandomWords(
							txReceipt.events[1].args.requestId,
							raffle.address
						);
					});
				});
			});
	  });
