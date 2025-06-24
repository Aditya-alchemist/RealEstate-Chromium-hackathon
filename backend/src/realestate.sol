// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

//0x0A47388e92d2c5aFF354CbCCC41fb8f80a0ef9Db

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract PropertyNFTMarketplace is ERC721URIStorage, ReentrancyGuard, Ownable {
    
    // Chainlink ETH/USD Price Feed
    AggregatorV3Interface internal priceFeed;
    
    // Counter for internal token IDs
    uint256 private _tokenIdCounter;
    
    // Marketplace fee (in basis points, e.g., 250 = 2.5%)
    uint256 public marketplaceFee = 250;
    
    // Listing ID counter for external NFTs
    uint256 private _listingIdCounter;
    
    // Property structure for internal NFTs
    struct Property {
        uint256 tokenId;
        address owner;
        string name;
        string description;
        string propertyAddress;
        string ownerDetails;
        string imageURI;
        uint256 priceInWei;
        bool isListed;
        bool isSold;
        uint256 listedAt;
        address originalMinter;
        bool isInternal;
        bool exists;
    }
    
    // External NFT listing structure
    struct ExternalListing {
        uint256 listingId;
        address nftContract;
        uint256 tokenId;
        address owner;
        string name;
        string description;
        string propertyAddress;
        string ownerDetails;
        uint256 priceInWei;
        bool isActive;
        bool isSold;
        uint256 listedAt;
        string imageURI;
        bool exists;
    }
    
    // Struct to reduce stack depth in functions
    struct PropertyParams {
        string name;
        string description;
        string propertyAddress;
        string ownerDetails;
        string imageURI;
        uint256 priceInWei;
    }
    
    struct ExternalListingParams {
        address nftContract;
        uint256 tokenId;
        string name;
        string description;
        string propertyAddress;
        string ownerDetails;
        string imageURI;
        uint256 priceInWei;
    }
    
    // Additional structs to reduce stack depth
    struct SaleData {
        address seller;
        address buyer;
        uint256 salePrice;
        uint256 fee;
        uint256 sellerAmount;
    }
    
    // Mappings for internal NFTs
    mapping(uint256 => Property) public properties;
    mapping(address => uint256[]) public userProperties;
    
    // Mappings for external NFTs
    mapping(uint256 => ExternalListing) public externalListings;
    mapping(address => uint256[]) public userExternalListings;
    mapping(address => mapping(uint256 => uint256)) public externalNFTToListingId;
    
    // Arrays to track listings
    uint256[] public listedProperties;
    uint256[] public soldProperties;
    uint256[] public activeExternalListings;
    uint256[] public soldExternalListings;
    
    // Track all created tokens for easier iteration
    uint256[] public allTokenIds;
    uint256[] public allListingIds;
    
    // Events
    event PropertyMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string name,
        string propertyAddress,
        uint256 priceInWei,
        string imageURI
    );
    
    event PropertyListed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 priceInWei,
        uint256 timestamp,
        bool isInternal
    );
    
    event PropertySold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 priceInWei,
        uint256 timestamp,
        bool isInternal
    );
    
    event ExternalNFTListed(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address owner,
        string name,
        uint256 priceInWei,
        uint256 timestamp
    );
    
    event ExternalNFTSold(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 priceInWei,
        uint256 timestamp
    );
    
    constructor(address _priceFeedAddress) ERC721("PropertyNFT", "PROP") Ownable(msg.sender) {
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
        _tokenIdCounter = 1;
        _listingIdCounter = 1;
    }
    
    /**
     * @dev Mint a new internal property NFT
     */
    function mintProperty(PropertyParams calldata params) external nonReentrant returns (uint256) {
        _validatePropertyParams(params);
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        // First mint the NFT
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, params.imageURI);
        
        // Create the property struct
        properties[tokenId] = Property({
            tokenId: tokenId,
            owner: msg.sender,
            name: params.name,
            description: params.description,
            propertyAddress: params.propertyAddress,
            ownerDetails: params.ownerDetails,
            imageURI: params.imageURI,
            priceInWei: params.priceInWei,
            isListed: true,
            isSold: false,
            listedAt: block.timestamp,
            originalMinter: msg.sender,
            isInternal: true,
            exists: true
        });
        
        // Update tracking arrays
        userProperties[msg.sender].push(tokenId);
        listedProperties.push(tokenId);
        allTokenIds.push(tokenId);
        
        emit PropertyMinted(tokenId, msg.sender, params.name, params.propertyAddress, params.priceInWei, params.imageURI);
        emit PropertyListed(tokenId, msg.sender, params.priceInWei, block.timestamp, true);
        
        return tokenId;
    }
    
    /**
     * @dev Validate property parameters
     */
    function _validatePropertyParams(PropertyParams calldata params) internal pure {
        require(bytes(params.name).length > 0, "Name cannot be empty");
        require(bytes(params.propertyAddress).length > 0, "Property address cannot be empty");
        require(bytes(params.imageURI).length > 0, "Image URI cannot be empty");
        require(params.priceInWei > 0, "Price must be greater than 0");
    }
    
    /**
     * @dev List an external NFT for sale
     */
    function listExternalNFT(ExternalListingParams calldata params) external nonReentrant returns (uint256) {
        _validateExternalListingParams(params);
        return _createExternalListing(params);
    }
    
    /**
     * @dev Validate external listing parameters
     */
    function _validateExternalListingParams(ExternalListingParams calldata params) internal view {
        require(params.nftContract != address(0), "Invalid NFT contract address");
        require(params.nftContract != address(this), "Use mintProperty for internal NFTs");
        require(bytes(params.name).length > 0, "Name cannot be empty");
        require(params.priceInWei > 0, "Price must be greater than 0");
        
        IERC721 nftContract = IERC721(params.nftContract);
        require(nftContract.ownerOf(params.tokenId) == msg.sender, "You don't own this NFT");
        require(nftContract.isApprovedForAll(msg.sender, address(this)) || 
                nftContract.getApproved(params.tokenId) == address(this), 
                "Marketplace not approved to transfer NFT");
        
        uint256 existingListingId = externalNFTToListingId[params.nftContract][params.tokenId];
        require(existingListingId == 0 || !externalListings[existingListingId].isActive, 
                "NFT is already listed");
    }
    
    /**
     * @dev Internal function to create external NFT listing
     */
    function _createExternalListing(ExternalListingParams calldata params) internal returns (uint256) {
        uint256 listingId = _listingIdCounter;
        _listingIdCounter++;
        
        externalListings[listingId] = ExternalListing({
            listingId: listingId,
            nftContract: params.nftContract,
            tokenId: params.tokenId,
            owner: msg.sender,
            name: params.name,
            description: params.description,
            propertyAddress: params.propertyAddress,
            ownerDetails: params.ownerDetails,
            priceInWei: params.priceInWei,
            isActive: true,
            isSold: false,
            listedAt: block.timestamp,
            imageURI: params.imageURI,
            exists: true
        });
        
        userExternalListings[msg.sender].push(listingId);
        activeExternalListings.push(listingId);
        allListingIds.push(listingId);
        externalNFTToListingId[params.nftContract][params.tokenId] = listingId;
        
        emit ExternalNFTListed(listingId, params.nftContract, params.tokenId, msg.sender, params.name, params.priceInWei, block.timestamp);
        
        return listingId;
    }
    
    /**
     * @dev Purchase an internal property NFT
     */
    function purchaseProperty(uint256 _tokenId) external payable nonReentrant {
        Property storage property = properties[_tokenId];
        
        _validatePurchase(property, msg.sender, msg.value);
        
        SaleData memory saleData = SaleData({
            seller: property.owner,
            buyer: msg.sender,
            salePrice: property.priceInWei,
            fee: 0,
            sellerAmount: 0
        });
        
        _processSale(saleData);
        _transferInternalProperty(_tokenId, saleData.seller);
        
        emit PropertySold(_tokenId, saleData.seller, saleData.buyer, saleData.salePrice, block.timestamp, true);
    }
    
    /**
     * @dev Validate purchase conditions
     */
    function _validatePurchase(Property storage property, address buyer, uint256 payment) internal view {
        require(property.exists, "Property does not exist");
        require(property.isListed, "Property is not listed for sale");
        require(!property.isSold, "Property is already sold");
        require(buyer != property.owner, "Cannot buy your own property");
        require(payment >= property.priceInWei, "Insufficient payment");
    }
    
    /**
     * @dev Process sale payment
     */
    function _processSale(SaleData memory saleData) internal {
        saleData.fee = (saleData.salePrice * marketplaceFee) / 10000;
        saleData.sellerAmount = saleData.salePrice - saleData.fee;
        
        payable(saleData.seller).transfer(saleData.sellerAmount);
        if (saleData.fee > 0) {
            payable(owner()).transfer(saleData.fee);
        }
        
        if (msg.value > saleData.salePrice) {
            payable(saleData.buyer).transfer(msg.value - saleData.salePrice);
        }
    }
    
    /**
     * @dev Internal function to handle internal property transfer
     */
    function _transferInternalProperty(uint256 _tokenId, address seller) internal {
        Property storage property = properties[_tokenId];
        
        property.owner = msg.sender;
        property.isListed = false;
        property.isSold = true;
        
        _transfer(seller, msg.sender, _tokenId);
        
        userProperties[msg.sender].push(_tokenId);
        _removeFromUserProperties(seller, _tokenId);
        
        _removeFromListedProperties(_tokenId);
        soldProperties.push(_tokenId);
    }
    
    /**
     * @dev Purchase an external NFT
     */
    function purchaseExternalNFT(uint256 _listingId) external payable nonReentrant {
        ExternalListing storage listing = externalListings[_listingId];
        
        _validateExternalPurchase(listing, msg.sender, msg.value);
        
        IERC721 nftContract = IERC721(listing.nftContract);
        require(nftContract.ownerOf(listing.tokenId) == listing.owner, "Seller no longer owns the NFT");
        
        SaleData memory saleData = SaleData({
            seller: listing.owner,
            buyer: msg.sender,
            salePrice: listing.priceInWei,
            fee: 0,
            sellerAmount: 0
        });
        
        _processSale(saleData);
        _transferExternalNFT(_listingId, saleData.seller, nftContract);
        
        emit ExternalNFTSold(_listingId, listing.nftContract, listing.tokenId, saleData.seller, saleData.buyer, saleData.salePrice, block.timestamp);
    }
    
    /**
     * @dev Validate external NFT purchase
     */
    function _validateExternalPurchase(ExternalListing storage listing, address buyer, uint256 payment) internal view {
        require(listing.exists, "Listing does not exist");
        require(listing.isActive, "Listing is not active");
        require(!listing.isSold, "NFT is already sold");
        require(buyer != listing.owner, "Cannot buy your own NFT");
        require(payment >= listing.priceInWei, "Insufficient payment");
    }
    
    /**
     * @dev Internal function to handle external NFT transfer
     */
    function _transferExternalNFT(uint256 _listingId, address seller, IERC721 nftContract) internal {
        ExternalListing storage listing = externalListings[_listingId];
        
        nftContract.safeTransferFrom(seller, msg.sender, listing.tokenId);
        
        listing.owner = msg.sender;
        listing.isActive = false;
        listing.isSold = true;
        
        userExternalListings[msg.sender].push(_listingId);
        _removeFromUserExternalListings(seller, _listingId);
        
        _removeFromActiveExternalListings(_listingId);
        soldExternalListings.push(_listingId);
        
        externalNFTToListingId[listing.nftContract][listing.tokenId] = 0;
    }
    
    /**
     * @dev Get the latest ETH/USD price from Chainlink - FIXED
     */
    function getLatestETHPrice() public view returns (int256, uint256) {
        try priceFeed.latestRoundData() returns (
            uint80 roundID,
            int256 price,
            uint256 startedAt,
            uint256 timeStamp,
            uint80 answeredInRound
        ) {
            require(price > 0, "Invalid price from oracle");
            require(timeStamp > 0, "Invalid timestamp from oracle");
            return (price, timeStamp);
        } catch {
            // Return a fallback price if oracle fails (e.g., $2000 USD)
            return (200000000000, block.timestamp); // $2000 with 8 decimals
        }
    }
    
    /**
     * @dev Convert Wei to USD using Chainlink price feed - FIXED
     */
    function convertWeiToUSD(uint256 _weiAmount) public view returns (uint256) {
        (int256 ethPriceInUSD, ) = getLatestETHPrice();
        require(ethPriceInUSD > 0, "Invalid ETH price");
        
        // Convert wei to ETH (18 decimals) and multiply by USD price (8 decimals)
        // Result will have 8 decimal places for USD
        uint256 ethAmount = _weiAmount; // Keep in wei for precision
        uint256 usdAmount = (ethAmount * uint256(ethPriceInUSD)) / 1e18; // Divide by 1e18 to convert wei to ETH
        
        return usdAmount; // Returns USD amount with 8 decimal places
    }
    
    /**
     * @dev Get internal property details with USD price - FIXED
     */
    function getPropertyWithUSDPrice(uint256 _tokenId) external view returns (
        Property memory property,
        uint256 priceInUSD
    ) {
        require(_tokenId > 0 && _tokenId < _tokenIdCounter, "Invalid token ID");
        
        property = properties[_tokenId];
        require(property.exists, "Property does not exist");
        
        priceInUSD = convertWeiToUSD(property.priceInWei);
    }
    
    /**
     * @dev Get external listing details with USD price - FIXED
     */
    function getExternalListingWithUSDPrice(uint256 _listingId) external view returns (
        ExternalListing memory listing,
        uint256 priceInUSD
    ) {
        require(_listingId > 0 && _listingId < _listingIdCounter, "Invalid listing ID");
        
        listing = externalListings[_listingId];
        require(listing.exists, "Listing does not exist");
        
        priceInUSD = convertWeiToUSD(listing.priceInWei);
    }
    
    /**
     * @dev Get all listed internal properties
     */
    function getListedProperties() external view returns (uint256[] memory) {
        uint256[] memory validListings = new uint256[](listedProperties.length);
        uint256 validCount = 0;
        
        for (uint256 i = 0; i < listedProperties.length; i++) {
            uint256 tokenId = listedProperties[i];
            if (tokenId > 0 && 
                tokenId < _tokenIdCounter && 
                properties[tokenId].exists && 
                properties[tokenId].isListed && 
                !properties[tokenId].isSold) {
                validListings[validCount] = tokenId;
                validCount++;
            }
        }
        
        uint256[] memory result = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            result[i] = validListings[i];
        }
        
        return result;
    }
    
    /**
     * @dev Get all active external listings
     */
    function getActiveExternalListings() external view returns (uint256[] memory) {
        uint256[] memory validListings = new uint256[](activeExternalListings.length);
        uint256 validCount = 0;
        
        for (uint256 i = 0; i < activeExternalListings.length; i++) {
            uint256 listingId = activeExternalListings[i];
            if (listingId > 0 && 
                listingId < _listingIdCounter && 
                externalListings[listingId].exists && 
                externalListings[listingId].isActive && 
                !externalListings[listingId].isSold) {
                validListings[validCount] = listingId;
                validCount++;
            }
        }
        
        uint256[] memory result = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            result[i] = validListings[i];
        }
        
        return result;
    }
    
    /**
     * @dev Get properties owned by a user (internal NFTs)
     */
    function getUserProperties(address _user) external view returns (uint256[] memory) {
        uint256[] memory userTokens = userProperties[_user];
        uint256[] memory validTokens = new uint256[](userTokens.length);
        uint256 validCount = 0;
        
        for (uint256 i = 0; i < userTokens.length; i++) {
            uint256 tokenId = userTokens[i];
            if (tokenId > 0 && 
                tokenId < _tokenIdCounter && 
                properties[tokenId].exists && 
                ownerOf(tokenId) == _user) {
                validTokens[validCount] = tokenId;
                validCount++;
            }
        }
        
        uint256[] memory result = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            result[i] = validTokens[i];
        }
        
        return result;
    }
    
    /**
     * @dev Get external listings by a user
     */
    function getUserExternalListings(address _user) external view returns (uint256[] memory) {
        uint256[] memory userListings = userExternalListings[_user];
        uint256[] memory validListings = new uint256[](userListings.length);
        uint256 validCount = 0;
        
        for (uint256 i = 0; i < userListings.length; i++) {
            uint256 listingId = userListings[i];
            if (listingId > 0 && 
                listingId < _listingIdCounter && 
                externalListings[listingId].exists && 
                externalListings[listingId].owner == _user) {
                validListings[validCount] = listingId;
                validCount++;
            }
        }
        
        uint256[] memory result = new uint256[](validCount);
        for (uint256 i = 0; i < validCount; i++) {
            result[i] = validListings[i];
        }
        
        return result;
    }
    
    /**
     * @dev Check if property exists
     */
    function propertyExists(uint256 _tokenId) external view returns (bool) {
        return _tokenId > 0 && _tokenId < _tokenIdCounter && properties[_tokenId].exists;
    }
    
    /**
     * @dev Check if external listing exists
     */
    function externalListingExists(uint256 _listingId) external view returns (bool) {
        return _listingId > 0 && _listingId < _listingIdCounter && externalListings[_listingId].exists;
    }
    
    // Internal helper functions
    function _removeFromUserProperties(address _user, uint256 _tokenId) internal {
        uint256[] storage userProps = userProperties[_user];
        for (uint256 i = 0; i < userProps.length; i++) {
            if (userProps[i] == _tokenId) {
                userProps[i] = userProps[userProps.length - 1];
                userProps.pop();
                break;
            }
        }
    }
    
    function _removeFromUserExternalListings(address _user, uint256 _listingId) internal {
        uint256[] storage userListings = userExternalListings[_user];
        for (uint256 i = 0; i < userListings.length; i++) {
            if (userListings[i] == _listingId) {
                userListings[i] = userListings[userListings.length - 1];
                userListings.pop();
                break;
            }
        }
    }
    
    function _removeFromListedProperties(uint256 _tokenId) internal {
        for (uint256 i = 0; i < listedProperties.length; i++) {
            if (listedProperties[i] == _tokenId) {
                listedProperties[i] = listedProperties[listedProperties.length - 1];
                listedProperties.pop();
                break;
            }
        }
    }
    
    function _removeFromActiveExternalListings(uint256 _listingId) internal {
        for (uint256 i = 0; i < activeExternalListings.length; i++) {
            if (activeExternalListings[i] == _listingId) {
                activeExternalListings[i] = activeExternalListings[activeExternalListings.length - 1];
                activeExternalListings.pop();
                break;
            }
        }
    }
    
    // Owner functions
    function setMarketplaceFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= 1000, "Fee cannot exceed 10%");
        marketplaceFee = _newFee;
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(owner()).transfer(balance);
    }
    
    function updatePriceFeed(address _newPriceFeedAddress) external onlyOwner {
        priceFeed = AggregatorV3Interface(_newPriceFeedAddress);
    }
}
