{
  description = "discord openrouter client";

  nixConfig = {
    extra-substituters = [
      "https://trevnur.cachix.org"
    ];
    extra-trusted-public-keys = [
      "trevnur.cachix.org-1:hBd15IdszwT52aOxdKs5vNTbq36emvEeGqpb25Bkq6o="
    ];
  };

  inputs = {
    systems.url = "systems";
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
    nur = {
      url = "github:nix-community/NUR";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    nixpkgs,
    utils,
    nur,
    ...
  }:
    utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [nur.overlays.default];
        config.allowUnfree = true;
      };
    in rec {
      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          git
          pkgs.nur.repos.trev.bumper

          # Node
          nodejs_22
          biome
          prettier

          # Nix
          alejandra

          # Actions
          action-validator
          skopeo
          pkgs.nur.repos.trev.renovate
        ];
        shellHook = pkgs.nur.repos.trev.shellhook.ref;
      };

      packages = rec {
        default = pkgs.buildNpmPackage (finalAttrs: {
          pname = "discord-openrouter";
          version = "0.0.7";
          src = ./.;
          nodejs = pkgs.nodejs_22;

          npmDeps = pkgs.importNpmLock {
            npmRoot = ./.;
          };

          npmConfigHook = pkgs.importNpmLock.npmConfigHook;

          nativeBuildInputs = with pkgs; [
            makeWrapper
          ];

          installPhase = ''
            runHook preInstall

            mkdir -p $out/{bin,lib/node_modules/discord-openrouter}
            cp -r dist node_modules package.json $out/lib/node_modules/discord-openrouter

            makeWrapper "${pkgs.lib.getExe pkgs.nodejs_22}" "$out/bin/discord-openrouter" \
              --add-flags "$out/lib/node_modules/discord-openrouter/dist/index.js"

            runHook postInstall
          '';

          meta.mainProgram = "discord-openrouter";
        });

        image = pkgs.dockerTools.streamLayeredImage {
          name = "${default.pname}";
          tag = "${default.version}";
          created = "now";
          contents = with pkgs; [
            default
            dockerTools.caCertificates
          ];
          config = {
            Cmd = [
              "${pkgs.lib.meta.getExe default}"
            ];
          };
        };
      };

      checks =
        pkgs.nur.repos.trev.lib.mkChecks {
          lint = {
            src = ./.;
            deps = with pkgs; [
              biome
              prettier
              alejandra
              action-validator
              pkgs.nur.repos.trev.renovate
            ];
            script = ''
              biome check .
              prettier --check .
              alejandra -c .
              action-validator .github/workflows/*
              renovate-config-validator
              renovate-config-validator .github/renovate-global.json
            '';
          };
        }
        // {
          build = packages.default.overrideAttrs {
            doCheck = true;
          };
          shell = devShells.default;
        };

      formatter = pkgs.alejandra;
    });
}
