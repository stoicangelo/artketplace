const { expect } = require("chai");
const { ethers } = require("hardhat");
// const { it } = require("mocha");
// const { describe, beforeEach, it } = require('mocha')


const toWei = (num) => ethers.utils.parseEther(num.toString())
const fromWei = num => ethers.utils.formatEther(num)

describe("NftMarketplace", () => {
    let deployer, addr1, addr2, marketplace, nft, addrs;
    let feePercent = 1;
    let URI = "Sample URI";
    beforeEach(async () => {
        const NFT = await ethers.getContractFactory("NFT");
        const Marketplace = await ethers.getContractFactory("Marketplace");

        [deployer, addr1, addr2, ...addrs] = await ethers.getSigners();

        nft = await NFT.deploy();
        marketplace = await Marketplace.deploy(feePercent);
        // console.log("Marketplace contract address : ", marketplace.address);
    })

    describe("Deployment", () => {

        it("Tracks name and symbol of NFT collection", async () => {
            expect(await nft.name()).to.equal("My NFT1910");
            expect(await nft.symbol()).to.equal("MFT");

        })

        it("Tracks feePercent and feeAccount of the marketplace", async () => {
            expect(await marketplace.feeAccount()).to.equal(deployer.address);
            expect(await marketplace.feePercent()).to.equal(feePercent);

        })
    })

    describe("Minting of NFTs", () => {

        it("Tracks minting of each NFT", async () => {

            await nft.connect(addr1).mint(URI);
            expect(await nft.tokenCount()).to.equal(1);
            expect(await nft.balanceOf(addr1.address)).to.equal(1);
            expect(await nft.tokenURI(1)).to.equal(URI);

            await nft.connect(addr2).mint(URI);
            expect(await nft.tokenCount()).to.equal(2);
            expect(await nft.balanceOf(addr2.address)).to.equal(1);
            expect(await nft.tokenURI(2)).to.equal(URI);

        })
    })


    describe("Making Marketplace items", () => {

        let price = 1;
        beforeEach(async () => {
            //addr1 mints an nft
            await nft.connect(addr1).mint(URI);
            //addr1 approves the marketplace to transfer the token around
            await nft.connect(addr1).setApprovalForAll(marketplace.address, true);
        })

        it("Tracks new minted item, transfer NFT from seller to marketplace and emit the Offered event", async () => {
            //addr1 offers their minted token @ 1 ETH
            await expect(marketplace.connect(addr1).makeItem(nft.address, 1, toWei(price)))
                .to.emit(marketplace, "Offered")
                .withArgs(
                    1,
                    nft.address,
                    1,
                    toWei(price),
                    addr1.address
                );
            //owner of nft should now be marketplace
            expect(await nft.ownerOf(1)).to.equal(marketplace.address);
        })

        it("Failure case. To fail when price is zero", async () => {
            await expect(
                marketplace.connect(addr1).makeItem(nft.address, 1, 0)
            ).to.be.revertedWith("Price of token must be greater than zero");
        })

    })


    describe("Purchasing Marketplace items", async () => {

        let price = 2;
        let fee = (feePercent/100)*price;
        let totalPriceInWei;

        beforeEach(async () => {
            //addr1 mints an nft
            await nft.connect(addr1).mint(URI);
            //addr1 approves the marketplace to transfer the token around
            await nft.connect(addr1).setApprovalForAll(marketplace.address, true);
            await marketplace.connect(addr1).makeItem(nft.address, 1, toWei(price));
            totalPriceInWei =  await marketplace.getTotalPrice(1);
        })

        it("All purchase state changes should happen", async () => {
            const sellerInitialBal = await addr1.getBalance();
            const feeAccInitialBal = await deployer.getBalance();
            // console.log(`seller initial = ${fromWei(sellerInitialBal)}`);
            // console.log(`feeAcc initial = ${fromWei(feeAccInitialBal)}`);
            await expect(marketplace.connect(addr2).purchaseItem(1, { value: totalPriceInWei }))
                .to.emit(marketplace, "Bought")
                .withArgs(
                    1,
                    nft.address,
                    1,
                    toWei(price),
                    addr1.address,
                    addr2.address
                );
            const sellerFinalEthBal = await addr1.getBalance()
            const feeAccountFinalEthBal = await deployer.getBalance()
            // console.log(`seller final = ${fromWei(sellerFinalEthBal)}`);
            // console.log(`feeAcc final = ${fromWei(feeAccountFinalEthBal)}`);
            // console.log(`feeA = ${fee}`);
            // console.log(`price = ${price}`);
            
            // Item should be marked as sold
            expect((await marketplace.items(1)).sold).to.equal(true)
            // Seller should receive payment for the price of the NFT sold.
            expect(+fromWei(sellerFinalEthBal)).to.equal(+price + +fromWei(sellerInitialBal))
            // feeAccount should receive fee
            expect(+fromWei(feeAccountFinalEthBal)).to.equal(+fee + +fromWei(feeAccInitialBal))
            // The buyer should now own the nft
            expect(await nft.ownerOf(1)).to.equal(addr2.address);

        })

        it("Purchase Should fail for all invalid inputs", async function () {
            // fails for invalid item ids
            await expect(
              marketplace.connect(addr2).purchaseItem(2, {value: totalPriceInWei})
            ).to.be.revertedWith("Item doesnt exist");
            await expect(
              marketplace.connect(addr2).purchaseItem(0, {value: totalPriceInWei})
            ).to.be.revertedWith("Item doesnt exist");
            // Fails when not enough ether is paid with the transaction. 
            // In this instance, fails when buyer only sends enough ether to cover the price of the nft
            // not the additional market fee.
            await expect(
              marketplace.connect(addr2).purchaseItem(1, {value: toWei(price)})
            ).to.be.revertedWith("Insufficient amount for purchase"); 
            // addr2 purchases item 1
            await marketplace.connect(addr2).purchaseItem(1, {value: totalPriceInWei})
            // addr3 tries purchasing item 1 after its been sold 
            const addr3 = addrs[0]
            await expect(
              marketplace.connect(addr3).purchaseItem(1, {value: totalPriceInWei})
            ).to.be.revertedWith("Item already sold");
          });
    })



})