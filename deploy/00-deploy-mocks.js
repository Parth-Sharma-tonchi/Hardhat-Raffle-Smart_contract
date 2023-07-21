const { developmentChains } = require("../helper-hardhat-config");
const { ethers, network } = require("hardhat");

const BASE_FEE = ethers.utils.parseEther("0.25"); //0.25 is the premium. It costs 0.25 LINK.
const GAS_PRICE_LINK = 1e9; //link per gas.

module.exports = async function ({ getNamedAccounts, deployments }) {
	const { deployer } = await getNamedAccounts();
	const { deploy, log } = deployments;
	const chainId = network.config.chainId;

	const args = [BASE_FEE, GAS_PRICE_LINK];

	if (developmentChains.includes(network.name)) {
		log("Local network detected! Deploying Mocks...");
		//deploy a mock vrfcoordinator
		await deploy("VRFCoordinatorV2Mock", {
			from: deployer,
			log: true,
			args: args,
		});
		log("Mocks Deployed!");
		log("----------------------------------------------------------");
		log(
			"You are deploying to a local network, you'll need a local network running to interact"
		);
		log(
			"Please run `yarn hardhat console --network localhost` to interact with the deployed smart contracts!"
		);
		log("----------------------------------------------------------");
	}
};

module.exports.tags = ["all", "mocks"];
