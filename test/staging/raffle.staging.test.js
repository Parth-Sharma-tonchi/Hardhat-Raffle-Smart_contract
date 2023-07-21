const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkconfig } = require("../../helper-hardhat-config.js");
const { assert, expect } = require("chai");

developmentChains.includes(network.name)
	? describe.skip
	: describe("Raffle", async function () {
			let raffle, deployer, raffleEntranceFee;
			const chainId = network.config.chainId;

			beforeEach(async function () {
				deployer = (await getNamedAccounts()).deployer;
				raffle = await ethers.getContract("Raffle", deployer);
				raffleEntranceFee = await raffle.getEntranceFee();
			});

			describe("fulfillRandomWords", async function () {
				it("works with the chainlink keepers and chainlink vrf, we get a random winner", async function (done) {
					const startingTimeStamp = await raffle.getLastTimeStamp();
					const accounts = await ethers.getSigners();

					await new Promise(async (resolve, reject) => {
						//setUp listener before we enter the raffle
						//just in case the blockchain moves really fast
						await raffle.once("WinnerPicked", async () => {
							console.log("WinnerPicked event fired");
							try {
								//add our asserts here
								const recentWinner = await raffle.getRecentWinner();
								const raffleState = await raffle.getRaffleState();
								const winnerEndingBalance = await accounts[0].getBalance();
								const endingTimeStamp = await raffle.getLastTimeStamp();

								await expect(raffle.getPlayers(0)).to.be.reverted;
								assert.equal(recentWinner.toString(), account[0].address);
								assert(endingTimeStamp > startingTimeStamp);
								assert(
									winnerEndingBalance.toString(),
									winnerStartingBalance.add(raffleEntranceFee).toString()
								);
								resolve();
								done();
							} catch (error) {
								console.log(error);
								reject(error);
							}
						});
						const tx = await raffle.EnterToLottery({ value: raffleEntranceFee });
						const winnerStartingBalance = await accounts[0].getBalance();
					});
				});
			});
	  });
