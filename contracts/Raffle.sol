//creating a raffle contract
//Enter the lottery(paying some amount)
//pick up a random winner(verifiably random)
//winner to be selected every x minutes -> completely automated
//we use Chainlink Oracle -> Randomness, Automatic Execution(Chainlink Keepers)

//SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__NotEnoughEth();
error Raffle__TransferFails();
error Raffle__NotOpen();
error Raffle__upkeepNotNeeded(
	uint256 currentBalance,
	/**
	 * @title A smaple Raffle contract
	 * @author Parth sharma
	 * @notice This contract is for creating a sample raffle contract
	 * @dev This implements the Chainlink VRF Version 2
	 */
	uint256 numOfPlayers,
	uint256 raffleState
);

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
	// TYPE-declaration
	enum RaffleState {
		OPEN,
		CALCULATING
	}
	// State variable.
	uint256 private immutable i_entranceFee;
	address payable[] private s_players;
	VRFCoordinatorV2Interface private immutable i_vrfcoordinator;
	bytes32 private immutable i_gaslane;
	uint64 private immutable i_subscriptionId;
	uint16 private constant REQUEST_CONFIRMATIONS = 3;
	uint32 private immutable i_callbackGasLimit;
	uint32 private constant NUM_WORDS = 1;

	//Lottery variables
	address payable private s_recentWinner;
	RaffleState private s_raffleState;
	uint256 private immutable i_interval;
	uint256 private s_lastTimeStamp;

	// Events
	event RaffleEnter(address indexed player);
	event RequestedRandomWinner(uint256 indexed requestId);
	event WinnerPicked(address indexed s_recentWinner);

	//constructor
	constructor(
		address vrfCoordinatorV2,
		uint256 entranceFee,
		bytes32 gaslane,
		uint64 subscriptionId,
		uint32 callbackGasLimit,
		uint256 interval
	) VRFConsumerBaseV2(vrfCoordinatorV2) {
		i_entranceFee = entranceFee;
		i_vrfcoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
		i_gaslane = gaslane;
		i_subscriptionId = subscriptionId;
		i_callbackGasLimit = callbackGasLimit;
		s_raffleState = RaffleState.OPEN;
		i_interval = interval;
		s_lastTimeStamp = block.timestamp;
	}

	function EnterToLottery() public payable {
		// require(PayedAmount > entrance fee , "Not Enough to Enter");
		if (msg.value < i_entranceFee) {
			revert Raffle__NotEnoughEth();
		}
		if (s_raffleState != RaffleState.OPEN) {
			revert Raffle__NotOpen();
		}
		s_players.push(payable(msg.sender));
		emit RaffleEnter(msg.sender);
	}

	/**
	 * @dev This is the function that the Chainlik Keeper nodes call
	 * they look for the `upKeepNeeded` to return ture.
	 * The following should be true in order to return true:
	 * 1. Our time interval should have passed.
	 * 2. The lottery should have at least 1 player, and have some ETH
	 * 3.Our subscription is funded with LINK.
	 * 4. The lottery should be in an "open" state.
	 */
	function checkUpkeep(
		bytes memory /*checkData*/
	) public override returns (bool upkeepNeeded, bytes memory /*performData*/) {
		bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
		bool hasPlayers = s_players.length > 0;
		bool hasBalance = address(this).balance > 0;
		bool isOpen = RaffleState.OPEN == s_raffleState;
		upkeepNeeded = (isOpen && hasPlayers && hasBalance && timePassed) == true;
		return (upkeepNeeded, "0x0");
	}

	function performUpkeep(bytes calldata /*performData*/) external override {
		//request the random winner
		//Once we get it, do something with it
		// it is 2 transaction process
		(bool upkeepNeeded, ) = checkUpkeep("");
		if (!upkeepNeeded) {
			revert Raffle__upkeepNotNeeded(
				address(this).balance,
				s_players.length,
				uint256(s_raffleState)
			);
		}
		s_raffleState = RaffleState.CALCULATING;
		uint256 requestId = i_vrfcoordinator.requestRandomWords(
			i_gaslane,
			i_subscriptionId,
			REQUEST_CONFIRMATIONS,
			i_callbackGasLimit,
			NUM_WORDS
		);
		emit RequestedRandomWinner(requestId);
	}

	function fulfillRandomWords(
		uint256 /*requestId*/,
		uint256[] memory randomNumber
	) internal override {
		uint256 indexOfWinner = randomNumber[0] % s_players.length;
		address payable recentWinner = s_players[indexOfWinner];
		s_recentWinner = recentWinner;
		(bool success, ) = recentWinner.call{value: address(this).balance}("");

		//here winner picked, so we update all variables

		s_raffleState = RaffleState.OPEN;
		s_players = new address payable[](0);
		s_lastTimeStamp = block.timestamp;

		//revert if fails
		if (!success) {
			revert Raffle__TransferFails();
		}
		emit WinnerPicked(recentWinner);
	}

	//view and pure functions.
	function getEntranceFee() public view returns (uint256) {
		return i_entranceFee;
	}

	function getPlayers(uint256 playersIndex) public view returns (address) {
		return s_players[playersIndex];
	}

	function getRecentWinner() public view returns (address) {
		return s_recentWinner;
	}

	function getRaffleState() public view returns (RaffleState) {
		return s_raffleState;
	}

	function getNumWords() public pure returns (uint256) {
		return NUM_WORDS;
	}

	function getRequestConfirmation() public pure returns (uint256) {
		return REQUEST_CONFIRMATIONS;
	}

	function getLastTimeStamp() public view returns (uint256) {
		return s_lastTimeStamp;
	}

	function getInterval() public view returns (uint256) {
		return i_interval;
	}

	function getNumberOfPlayers() public view returns (uint256) {
		return s_players.length;
	}
}
