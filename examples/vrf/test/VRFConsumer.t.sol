// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { TestBase } from "../../TestBase.sol";
import { VulnerableVRFConsumer } from "../vulnerable/VulnerableVRFConsumer.sol";
import { FixedVRFConsumer } from "../fixed/FixedVRFConsumer.sol";

contract VRFConsumerTest is TestBase {
    address private constant COORDINATOR = address(0xCAFE);

    function testVulnerableAcceptsUnknownRequestFromCoordinator() external {
        VulnerableVRFConsumer consumer = new VulnerableVRFConsumer(COORDINATOR);
        uint256[] memory words = new uint256[](1);
        words[0] = 777;

        vm.prank(COORDINATOR);
        consumer.rawFulfillRandomWords(999, words);

        assertEq(consumer.lastRequestId(), 999);
        assertEq(consumer.randomResult(), 777);
    }

    function testFixedRejectsUnknownRequest() external {
        FixedVRFConsumer consumer = new FixedVRFConsumer(COORDINATOR);
        uint256[] memory words = new uint256[](1);
        words[0] = 777;

        vm.prank(COORDINATOR);
        vm.expectRevert(FixedVRFConsumer.UnknownRequest.selector);
        consumer.rawFulfillRandomWords(999, words);
    }

    function testFixedRejectsDuplicateFulfillment() external {
        FixedVRFConsumer consumer = new FixedVRFConsumer(COORDINATOR);
        uint256 requestId = consumer.requestRandomness();
        uint256[] memory words = new uint256[](1);
        words[0] = 123;

        vm.prank(COORDINATOR);
        consumer.rawFulfillRandomWords(requestId, words);

        vm.prank(COORDINATOR);
        vm.expectRevert(FixedVRFConsumer.UnknownRequest.selector);
        consumer.rawFulfillRandomWords(requestId, words);
    }
}
