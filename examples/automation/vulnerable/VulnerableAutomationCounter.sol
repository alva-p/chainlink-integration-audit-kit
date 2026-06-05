// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VulnerableAutomationCounter {
    uint256 public immutable interval;
    uint256 public lastExecutedAt;
    uint256 public counter;

    constructor(uint256 interval_) {
        interval = interval_;
        lastExecutedAt = block.timestamp;
    }

    function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData) {
        upkeepNeeded = block.timestamp >= lastExecutedAt + interval;
        performData = abi.encode(lastExecutedAt + interval);
    }

    function performUpkeep(bytes calldata performData) external {
        uint256 scheduledAt = abi.decode(performData, (uint256));
        lastExecutedAt = scheduledAt;
        counter++;
    }
}
