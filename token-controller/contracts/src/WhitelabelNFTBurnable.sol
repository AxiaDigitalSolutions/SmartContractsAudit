// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title WhitelabelNFTBurnable
 * @notice ERC-721 whitelabel "v2" das coleções da plataforma. Substitui o
 *         contrato legado (sol/NFT.json, solc 0.5.1) para coleções novas com
 *         `collections.contract_version = 'v2'`, habilitando queima nativa
 *         on-chain (strategy NATIVE_BURN) no lugar da transferência para sink.
 *
 * @dev    Compatibilidade OBRIGATÓRIA com o backend (MintService):
 *           - constructor(name, symbol)                       -> ActionsTools.deploy
 *           - mintWithTokenURI(address,uint256,string)->bool  -> mesmo selector do v1;
 *             o mint flow continua funcionando mesmo se codificado com a ABI v1.
 *           - burn(uint256)                                   -> MintService.burnNft (NFT.v2.json)
 *
 *         Papéis (deployer = main wallet do sistema recebe todos no deploy):
 *           MINTER_ROLE -> mintWithTokenURI
 *           BURNER_ROLE -> pode queimar QUALQUER token sem approval (operação
 *                          administrativa de burn conduzida pela plataforma).
 *           Holder      -> pode queimar o próprio token (ERC721Burnable).
 *
 *         Usa _mint (não _safeMint) por paridade com o v1
 *         (ERC721MetadataMintable do OZ 2.x): destinos são EOAs custodiais.
 */
contract WhitelabelNFTBurnable is ERC721URIStorage, ERC721Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    event Minted(address indexed to, uint256 indexed tokenId);
    event Burned(uint256 indexed tokenId, address indexed by);

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(MINTER_ROLE, _msgSender());
        _grantRole(BURNER_ROLE, _msgSender());
    }

    function mintWithTokenURI(
        address to,
        uint256 tokenId,
        string memory uri
    ) public onlyRole(MINTER_ROLE) returns (bool) {
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit Minted(to, tokenId);
        return true;
    }

    /// @notice Owner/approved queima via caminho ERC721Burnable; BURNER_ROLE
    ///         queima qualquer token sem approval (burn administrativo).
    function burn(uint256 tokenId) public override {
        if (hasRole(BURNER_ROLE, _msgSender()) && _msgSender() != _ownerOf(tokenId)) {
            _burn(tokenId);
        } else {
            super.burn(tokenId);
        }
        emit Burned(tokenId, _msgSender());
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
