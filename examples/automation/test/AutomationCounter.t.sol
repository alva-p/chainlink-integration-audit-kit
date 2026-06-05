// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { TestBase } from "../../TestBase.sol";
import { VulnerableAutomationCounter } from "../vulnerable/VulnerableAutomationCounter.sol";
import { FixedAutomationCounter } from "../fixed/FixedAutomationCounter.sol";

contract AutomationCounterTest is TestBase {
    function testVulnerablePerformUpkeepWithoutRevalidation() external {
        VulnerableAutomationCounter counter = new VulnerableAutomationCounter(1 days);
        (, bytes memory performData) = counter.checkUpkeep("");

        counter.performUpkeep(performData);

        assertEq(counter.counter(), 1);
    }

    function testFixedRejectsEarlyPerformUpkeep() external {
        FixedAutomationCounter counter = new FixedAutomationCounter(1 days);
        (, bytes memory performData) = counter.checkUpkeep("");

        vm.expectRevert(FixedAutomationCounter.UpkeepNotNeeded.selector);
        counter.performUpkeep(performData);
    }

    function testFixedRejectsStalePerformData() external {
        FixedAutomationCounter counter = new FixedAutomationCounter(1 days);
        vm.warp(block.timestamp + 1 days);
        (, bytes memory performData) = counter.checkUpkeep("");
        counter.performUpkeep(performData);

        vm.expectRevert(FixedAutomationCounter.StalePerformData.selector);
        counter.performUpkeep(performData);
    }

    function testFixedAllowsValidPerformUpkeep() external {
        FixedAutomationCounter counter = new FixedAutomationCounter(1 days);
        vm.warp(block.timestamp + 1 days);
        (bool upkeepNeeded, bytes memory performData) = counter.checkUpkeep("");

        assertTrue(upkeepNeeded);
        counter.performUpkeep(performData);

        assertEq(counter.counter(), 1);
    }
}
