// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VulnerableVRFConsumer {
    error OnlyCoordinator();

    address public immutable coordinator;
    uint256 public lastRequestId;
    uint256 public randomResult;

    constructor(address coordinator_) {
        coordinator = coordinator_;
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != coordinator) revert OnlyCoordinator();
        fulfillRandomWords(requestId, randomWords);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal {
        lastRequestId = requestId;
        randomResult = randomWords[0];
    }
}
