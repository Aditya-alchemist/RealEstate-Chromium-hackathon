// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

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
    
    struct TransferData {
        uint256 tokenId;
        address from;
        address to;
        bool isInternal;
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
    
    // Events for internal NFTs
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
    
    event PropertyRelisted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 newPriceInWei,
        uint256 timestamp,
        bool isInternal
    );
    
    // Events for external NFTs
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
    
    event ExternalNFTDelisted(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address owner
    );
    
    event PriceUpdated(
        uint256 indexed tokenId,
        uint256 oldPrice,
        uint256 newPrice,
        bool isInternal
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
        
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, params.imageURI);
        
        _createProperty(tokenId, params);
        
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
     * @dev Internal function to create property struct
     */
    function _createProperty(uint256 tokenId, PropertyParams calldata params) internal {
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
            isInternal: true
        });
        
        userProperties[msg.sender].push(tokenId);
        listedProperties.push(tokenId);
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
        
        _storeExternalListing(listingId, params);
        
        emit ExternalNFTListed(listingId, params.nftContract, params.tokenId, msg.sender, params.name, params.priceInWei, block.timestamp);
        
        return listingId;
    }
    
    /**
     * @dev Internal function to store external listing
     */
    function _storeExternalListing(uint256 listingId, ExternalListingParams calldata params) internal {
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
            imageURI: params.imageURI
        });
        
        userExternalListings[msg.sender].push(listingId);
        activeExternalListings.push(listingId);
        externalNFTToListingId[params.nftContract][params.tokenId] = listingId;
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
        require(property.tokenId != 0, "Property does not exist");
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
        require(listing.listingId != 0, "Listing does not exist");
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
     * @dev Relist an internal property for sale
     */
    function relistProperty(uint256 _tokenId, uint256 _newPriceInWei) external {
        require(ownerOf(_tokenId) == msg.sender, "Not the owner of this property");
        require(_newPriceInWei > 0, "Price must be greater than 0");
        
        Property storage property = properties[_tokenId];
        require(property.tokenId != 0, "Property does not exist");
        require(!property.isListed, "Property is already listed");
        
        uint256 oldPrice = property.priceInWei;
        
        property.priceInWei = _newPriceInWei;
        property.isListed = true;
        property.isSold = false;
        property.listedAt = block.timestamp;
        
        _removeFromSoldProperties(_tokenId);
        listedProperties.push(_tokenId);
        
        emit PropertyRelisted(_tokenId, msg.sender, _newPriceInWei, block.timestamp, true);
        emit PriceUpdated(_tokenId, oldPrice, _newPriceInWei, true);
    }
    
    /**
     * @dev Relist an external NFT
     */
    function relistExternalNFT(ExternalListingParams calldata params) external nonReentrant returns (uint256) {
        IERC721 nftContract = IERC721(params.nftContract);
        require(nftContract.ownerOf(params.tokenId) == msg.sender, "You don't own this NFT");
        
        uint256 existingListingId = externalNFTToListingId[params.nftContract][params.tokenId];
        if (existingListingId != 0) {
            ExternalListing storage existingListing = externalListings[existingListingId];
            require(!existingListing.isActive, "NFT is already listed");
            
            _updateExternalListing(existingListingId, params);
            
            activeExternalListings.push(existingListingId);
            _removeFromSoldExternalListings(existingListingId);
            
            emit PropertyRelisted(params.tokenId, msg.sender, params.priceInWei, block.timestamp, false);
            return existingListingId;
        } else {
            return _createExternalListing(params);
        }
    }
    
    /**
     * @dev Internal function to update external listing
     */
    function _updateExternalListing(uint256 listingId, ExternalListingParams calldata params) internal {
        ExternalListing storage listing = externalListings[listingId];
        
        listing.owner = msg.sender;
        listing.name = params.name;
        listing.description = params.description;
        listing.propertyAddress = params.propertyAddress;
        listing.ownerDetails = params.ownerDetails;
        listing.imageURI = params.imageURI;
        listing.priceInWei = params.priceInWei;
        listing.isActive = true;
        listing.isSold = false;
        listing.listedAt = block.timestamp;
    }
    
    /**
     * @dev Update price of a listed internal property
     */
    function updatePropertyPrice(uint256 _tokenId, uint256 _newPriceInWei) external {
        require(ownerOf(_tokenId) == msg.sender, "Not the owner of this property");
        require(_newPriceInWei > 0, "Price must be greater than 0");
        
        Property storage property = properties[_tokenId];
        require(property.tokenId != 0, "Property does not exist");
        require(property.isListed, "Property is not listed");
        
        uint256 oldPrice = property.priceInWei;
        property.priceInWei = _newPriceInWei;
        
        emit PriceUpdated(_tokenId, oldPrice, _newPriceInWei, true);
    }
    
    /**
     * @dev Update price of an external NFT listing
     */
    function updateExternalNFTPrice(uint256 _listingId, uint256 _newPriceInWei) external {
        ExternalListing storage listing = externalListings[_listingId];
        require(listing.owner == msg.sender, "Not the owner of this listing");
        require(_newPriceInWei > 0, "Price must be greater than 0");
        require(listing.isActive, "Listing is not active");
        
        uint256 oldPrice = listing.priceInWei;
        listing.priceInWei = _newPriceInWei;
        
        emit PriceUpdated(listing.tokenId, oldPrice, _newPriceInWei, false);
    }
    
    /**
     * @dev Remove internal property from listing
     */
    function removeFromListing(uint256 _tokenId) external {
        require(ownerOf(_tokenId) == msg.sender, "Not the owner of this property");
        
        Property storage property = properties[_tokenId];
        require(property.tokenId != 0, "Property does not exist");
        require(property.isListed, "Property is not listed");
        
        property.isListed = false;
        _removeFromListedProperties(_tokenId);
    }
    
    /**
     * @dev Remove external NFT from listing
     */
    function removeExternalNFTFromListing(uint256 _listingId) external {
        ExternalListing storage listing = externalListings[_listingId];
        require(listing.owner == msg.sender, "Not the owner of this listing");
        require(listing.isActive, "Listing is not active");
        
        listing.isActive = false;
        _removeFromActiveExternalListings(_listingId);
        
        emit ExternalNFTDelisted(_listingId, listing.nftContract, listing.tokenId, msg.sender);
    }
    
    /**
     * @dev Get the latest ETH/USD price from Chainlink
     */
    function getLatestETHPrice() public view returns (int256, uint256) {
        (
            uint80 roundID,
            int256 price,
            uint256 startedAt,
            uint256 timeStamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        
        return (price, timeStamp);
    }
    
    /**
     * @dev Convert Wei to USD using Chainlink price feed
     */
    function convertWeiToUSD(uint256 _weiAmount) public view returns (uint256) {
        (int256 ethPriceInUSD, ) = getLatestETHPrice();
        require(ethPriceInUSD > 0, "Invalid ETH price");
        
        uint256 ethAmount = _weiAmount / 1e18;
        uint256 usdAmount = (ethAmount * uint256(ethPriceInUSD)) / 1e8;
        
        return usdAmount;
    }
    
    /**
     * @dev Get internal property details with USD price
     */
    function getPropertyWithUSDPrice(uint256 _tokenId) external view returns (
        Property memory property,
        uint256 priceInUSD
    ) {
        property = properties[_tokenId];
        priceInUSD = convertWeiToUSD(property.priceInWei);
    }
    
    /**
     * @dev Get external listing details with USD price
     */
    function getExternalListingWithUSDPrice(uint256 _listingId) external view returns (
        ExternalListing memory listing,
        uint256 priceInUSD
    ) {
        listing = externalListings[_listingId];
        priceInUSD = convertWeiToUSD(listing.priceInWei);
    }
    
    /**
     * @dev Get all listed internal properties
     */
    function getListedProperties() external view returns (uint256[] memory) {
        return listedProperties;
    }
    
    /**
     * @dev Get all sold internal properties
     */
    function getSoldProperties() external view returns (uint256[] memory) {
        return soldProperties;
    }
    
    /**
     * @dev Get all active external listings
     */
    function getActiveExternalListings() external view returns (uint256[] memory) {
        return activeExternalListings;
    }
    
    /**
     * @dev Get all sold external listings
     */
    function getSoldExternalListings() external view returns (uint256[] memory) {
        return soldExternalListings;
    }
    
    /**
     * @dev Get all listings with USD prices - optimized version
     */
    function getAllListingsWithPrices() external view returns (
        uint256[] memory internalTokenIds,
        uint256[] memory externalListingIds,
        uint256[] memory internalPricesUSD,
        uint256[] memory externalPricesUSD
    ) {
        internalTokenIds = listedProperties;
        externalListingIds = activeExternalListings;
        
        internalPricesUSD = new uint256[](internalTokenIds.length);
        externalPricesUSD = new uint256[](externalListingIds.length);
        
        _calculateInternalPricesUSD(internalTokenIds, internalPricesUSD);
        _calculateExternalPricesUSD(externalListingIds, externalPricesUSD);
    }
    
    /**
     * @dev Calculate internal prices in USD
     */
    function _calculateInternalPricesUSD(
        uint256[] memory tokenIds,
        uint256[] memory pricesUSD
    ) internal view {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            pricesUSD[i] = convertWeiToUSD(properties[tokenIds[i]].priceInWei);
        }
    }
    
    /**
     * @dev Calculate external prices in USD
     */
    function _calculateExternalPricesUSD(
        uint256[] memory listingIds,
        uint256[] memory pricesUSD
    ) internal view {
        for (uint256 i = 0; i < listingIds.length; i++) {
            pricesUSD[i] = convertWeiToUSD(externalListings[listingIds[i]].priceInWei);
        }
    }
    
    /**
     * @dev Get properties owned by a user (internal NFTs)
     */
    function getUserProperties(address _user) external view returns (uint256[] memory) {
        return userProperties[_user];
    }
    
    /**
     * @dev Get external listings by a user
     */
    function getUserExternalListings(address _user) external view returns (uint256[] memory) {
        return userExternalListings[_user];
    }
    
    /**
     * @dev Get total number of internal properties
     */
    function getTotalProperties() external view returns (uint256) {
        return _tokenIdCounter - 1;
    }
    
    /**
     * @dev Get total number of external listings
     */
    function getTotalExternalListings() external view returns (uint256) {
        return _listingIdCounter - 1;
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
    
    function _removeFromSoldProperties(uint256 _tokenId) internal {
        for (uint256 i = 0; i < soldProperties.length; i++) {
            if (soldProperties[i] == _tokenId) {
                soldProperties[i] = soldProperties[soldProperties.length - 1];
                soldProperties.pop();
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
    
    function _removeFromSoldExternalListings(uint256 _listingId) internal {
        for (uint256 i = 0; i < soldExternalListings.length; i++) {
            if (soldExternalListings[i] == _listingId) {
                soldExternalListings[i] = soldExternalListings[soldExternalListings.length - 1];
                soldExternalListings.pop();
                break;
            }
        }
    }
    
    // Owner functions
    function setMarketplaceFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= 1000, "Fee cannot exceed 10%"); // Max 10%
        marketplaceFee = _newFee;
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(owner()).transfer(balance);
    }
    
    // Emergency function to update price feed address
    function updatePriceFeed(address _newPriceFeedAddress) external onlyOwner {
        priceFeed = AggregatorV3Interface(_newPriceFeedAddress);
    }
}
