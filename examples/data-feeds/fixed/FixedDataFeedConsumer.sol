// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";

contract FixedDataFeedConsumer {
    error InvalidOracleAnswer();
    error StaleOracleAnswer();
    error OracleDown();

    AggregatorV3Interface public immutable feed;
    uint256 public immutable maxStaleness;

    constructor(AggregatorV3Interface feed_, uint256 maxStaleness_) {
        feed = feed_;
        maxStaleness = maxStaleness_;
    }

    function getPrice18Decimals() external view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();

        if (answer <= 0) revert InvalidOracleAnswer();
        if (updatedAt == 0) revert OracleDown();
        if (block.timestamp - updatedAt > maxStaleness) revert StaleOracleAnswer();

        uint8 feedDecimals = feed.decimals();
        uint256 price = uint256(answer);
        if (feedDecimals == 18) return price;
        if (feedDecimals < 18) return price * (10 ** (18 - feedDecimals));
        return price / (10 ** (feedDecimals - 18));
    }
}
