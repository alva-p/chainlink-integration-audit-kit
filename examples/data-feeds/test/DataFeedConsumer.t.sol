// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { TestBase } from "../../TestBase.sol";
import { MockAggregatorV3 } from "../mocks/MockAggregatorV3.sol";
import { VulnerableDataFeedConsumer } from "../vulnerable/VulnerableDataFeedConsumer.sol";
import { FixedDataFeedConsumer } from "../fixed/FixedDataFeedConsumer.sol";

contract DataFeedConsumerTest is TestBase {
    function testVulnerableAcceptsStalePrice() external {
        vm.warp(10 days);
        MockAggregatorV3 feed = new MockAggregatorV3(8, 2_000e8, 1);
        VulnerableDataFeedConsumer consumer = new VulnerableDataFeedConsumer(feed);

        assertEq(consumer.getPriceAssuming8Decimals(), 2_000e8);
    }

    function testFixedRejectsStalePrice() external {
        vm.warp(10 days);
        MockAggregatorV3 feed = new MockAggregatorV3(8, 2_000e8, 1);
        FixedDataFeedConsumer consumer = new FixedDataFeedConsumer(feed, 1 hours);

        vm.expectRevert(FixedDataFeedConsumer.StaleOracleAnswer.selector);
        consumer.getPrice18Decimals();
    }

    function testFixedRejectsNonPositiveAnswer() external {
        vm.warp(10 days);
        MockAggregatorV3 feed = new MockAggregatorV3(8, 0, block.timestamp);
        FixedDataFeedConsumer consumer = new FixedDataFeedConsumer(feed, 1 hours);

        vm.expectRevert(FixedDataFeedConsumer.InvalidOracleAnswer.selector);
        consumer.getPrice18Decimals();
    }

    function testFixedNormalizesDecimals() external {
        vm.warp(10 days);
        MockAggregatorV3 feed = new MockAggregatorV3(8, 2_000e8, block.timestamp);
        FixedDataFeedConsumer consumer = new FixedDataFeedConsumer(feed, 1 hours);

        assertEq(consumer.getPrice18Decimals(), 2_000e18);
    }
}
