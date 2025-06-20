// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PropertyNFTMarketplace} from "../src/realestate.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();

        PropertyNFTMarketplace marketplace = new PropertyNFTMarketplace(0x518Ef87c7d4A4BB1D4B5Af215b560c9Ccd74F79d);

        console.log("PropertyNFTMarketplace deployed at:", address(marketplace));

        vm.stopBroadcast();
    }
}