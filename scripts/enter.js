const { ethers } = require("hardhat");

async function EnterToLottery() {
	const raffle = await ethers.getContract("Raffle");
	const entranceFee = await raffle.getEntranceFee();
	await raffle.EnterToLottery({ value: entranceFee + 1 });
	console.log("Entered!");
}

EnterToLottery()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
