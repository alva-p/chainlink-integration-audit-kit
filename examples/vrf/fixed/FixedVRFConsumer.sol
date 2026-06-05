// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FixedVRFConsumer {
    error OnlyCoordinator();
    error UnknownRequest();

    address public immutable coordinator;
    uint256 public nextRequestId = 1;
    uint256 public lastFulfilledRequestId;
    uint256 public randomResult;
    mapping(uint256 requestId => bool pending) public pendingRequests;

    constructor(address coordinator_) {
        coordinator = coordinator_;
    }

    function requestRandomness() external returns (uint256 requestId) {
        requestId = nextRequestId++;
        pendingRequests[requestId] = true;
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != coordinator) revert OnlyCoordinator();
        fulfillRandomWords(requestId, randomWords);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal {
        if (!pendingRequests[requestId]) revert UnknownRequest();
        delete pendingRequests[requestId];
        lastFulfilledRequestId = requestId;
        randomResult = randomWords[0];
    }
}
