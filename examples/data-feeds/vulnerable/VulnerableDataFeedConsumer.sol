// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";

contract VulnerableDataFeedConsumer {
    AggregatorV3Interface public immutable feed;

    constructor(AggregatorV3Interface feed_) {
        feed = feed_;
    }

    function getPriceAssuming8Decimals() external view returns (uint256) {
        (, int256 answer,,,) = feed.latestRoundData();
        return uint256(answer);
    }
}
