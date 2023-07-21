const { getNamedAccounts, deployments } = require("hardhat");
const { network, ethers } = require("hardhat");
const { developmentChains, networkconfig } = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2");

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments;
	const { deployer } = await getNamedAccounts();
	const chainId = network.config.chainId;

	let vrfcoordinatorV2Address;
	let subscriptionId;

	if (developmentChains.includes(network.name)) {
		let vrfcoordinatorV2 = await ethers.getContract("VRFCoordinatorV2Mock");
		vrfcoordinatorV2Address = vrfcoordinatorV2.address;

		const transactionResponse = await vrfcoordinatorV2.createSubscription();
		const transactionReceipt = await transactionResponse.wait(1);
		subscriptionId = transactionReceipt.events[0].args.subId;
		await vrfcoordinatorV2.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT);
	} else {
		vrfcoordinatorV2Address = networkconfig[chainId]["vrfcoordinatorV2"];
		subscriptionId = networkconfig[chainId]["subscriptionId"];
	}

	const entranceFee = networkconfig[chainId]["entranceFee"];
	const gasLane = networkconfig[chainId]["gasLane"];
	const callbackGasLimit = networkconfig[chainId]["callbackGasLimit"];
	const interval = networkconfig[chainId]["interval"];

	const args = [
		vrfcoordinatorV2Address,
		entranceFee,
		gasLane,
		subscriptionId,
		callbackGasLimit,
		interval,
	];
	const raffle = await deploy("Raffle", {
		from: deployer,
		args: args,
		log: true,
		waitConfirmations: network.config.blockConfirmations || 1,
	});

	if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
		console.log("Verifying Contract...");
		await verify(raffle.address, args);
	}
	log("--------------------------------------------------------------------");

	if (developmentChains.includes(network.name)) {
		let vrfcoordinatorMock = await ethers.getContract("VRFCoordinatorV2Mock");

		await vrfcoordinatorMock.addConsumer(subscriptionId.toNumber(), raffle.address);

		log("Consumer is added");
	}
};

module.exports.tags = ["all", "raffle"];
