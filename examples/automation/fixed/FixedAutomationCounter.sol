// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FixedAutomationCounter {
    error UpkeepNotNeeded();
    error StalePerformData();

    uint256 public immutable interval;
    uint256 public lastExecutedAt;
    uint256 public counter;

    constructor(uint256 interval_) {
        interval = interval_;
        lastExecutedAt = block.timestamp;
    }

    function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData) {
        uint256 scheduledAt = lastExecutedAt + interval;
        upkeepNeeded = block.timestamp >= scheduledAt;
        performData = abi.encode(scheduledAt);
    }

    function performUpkeep(bytes calldata performData) external {
        uint256 scheduledAt = abi.decode(performData, (uint256));
        if (scheduledAt != lastExecutedAt + interval) revert StalePerformData();
        if (block.timestamp < scheduledAt) revert UpkeepNotNeeded();

        lastExecutedAt = scheduledAt;
        counter++;
    }
}
