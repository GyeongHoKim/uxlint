# [2.3.0](https://github.com/GyeongHoKim/uxlint/compare/v2.2.1...v2.3.0) (2025-12-03)


### Bug Fixes

* eslint issues of return type ([6322a8c](https://github.com/GyeongHoKim/uxlint/commit/6322a8c7f065f6845d8789c4882c983aee24c3a9))
* re-exporting types deleted ([7092e9b](https://github.com/GyeongHoKim/uxlint/commit/7092e9b54fc21a8e44cc14da29865569c7941e15))
* react key duplication issue ([6cabfbb](https://github.com/GyeongHoKim/uxlint/commit/6cabfbb2f668d20d5655123f2174ca7fec811c0c))


### Features

* adjust height of header component ([5276eb8](https://github.com/GyeongHoKim/uxlint/commit/5276eb88655b9ebd15013627b454ad7320797ae3))
* adjust unused components ([0fde557](https://github.com/GyeongHoKim/uxlint/commit/0fde5576cd1d2c77fb910d18a2c354962f46bcaf))
* prevent dotenv from writing stdout ([858b128](https://github.com/GyeongHoKim/uxlint/commit/858b128b29ea77aaa1f0b16ed9afbf4a68aad56c))
* responsive terminal ui ([4797ef2](https://github.com/GyeongHoKim/uxlint/commit/4797ef2cebac62189490832eced7d6aa82932846))
* waiting messages for fallback of llm response ([1ca80ad](https://github.com/GyeongHoKim/uxlint/commit/1ca80ad8d74ae61cfedf7653333b7e74f954d7a1))

## [2.2.1](https://github.com/GyeongHoKim/uxlint/compare/v2.2.0...v2.2.1) (2025-12-02)


### Bug Fixes

* delete console log and rename uxlint-machine into models ([6e08d75](https://github.com/GyeongHoKim/uxlint/commit/6e08d75488e7fe91d163ebf357e718348d750c73))
* remove hard coded delay ([138be79](https://github.com/GyeongHoKim/uxlint/commit/138be79e83ab2158e542fdcfbe54181c4b90be3e))
* tsconfig to compile test files into dist ([e3cb301](https://github.com/GyeongHoKim/uxlint/commit/e3cb301aa0bf4820e21b1f290904ba15348f28c7))
* unexpected process exit and rendering ([2e59327](https://github.com/GyeongHoKim/uxlint/commit/2e59327a6420ba8c2b492c81ecc273c209108eb1))

# [2.2.0](https://github.com/GyeongHoKim/uxlint/compare/v2.1.0...v2.2.0) (2025-12-01)


### Bug Fixes

* add yml format handling ([0e61c9e](https://github.com/GyeongHoKim/uxlint/commit/0e61c9e1fa3af89f5c9cec5697c3368eee389085))
* improve system prompt, file generation ([9248595](https://github.com/GyeongHoKim/uxlint/commit/92485957e20d992acc398bc59965fc5b59687644))
* remove hardcoded version information ([c49182d](https://github.com/GyeongHoKim/uxlint/commit/c49182d9db8660f41aa2aa472829140b60150e6a))
* top-level await ([a6258d0](https://github.com/GyeongHoKim/uxlint/commit/a6258d0b8faf30774cd1d29d1c075053467f42f4))


### Features

* add winston log module ([f77ed65](https://github.com/GyeongHoKim/uxlint/commit/f77ed650809952742083d76cc697b9d66d5b4108))
* make persona field single ([3e7cfd9](https://github.com/GyeongHoKim/uxlint/commit/3e7cfd9db135f83a7a7796c2ecbe0ee9c9d05f6e))
* migration to ava & ava/typescript ([3403c88](https://github.com/GyeongHoKim/uxlint/commit/3403c885e349d9f3baa99cb73d81148acca6512d))

# [2.1.0](https://github.com/GyeongHoKim/uxlint/compare/v2.0.0...v2.1.0) (2025-11-06)


### Bug Fixes

* ollama api url and default model fixed ([096fbb3](https://github.com/GyeongHoKim/uxlint/commit/096fbb33cbf7319929cd9438f34f2a9e4850e675))
* update default models of each LLM providers ([cf50ec4](https://github.com/GyeongHoKim/uxlint/commit/cf50ec48ced98e103405f6d0ca05947189df2c03))


### Features

* add Google (Gemini) provider support ([cfc0bac](https://github.com/GyeongHoKim/uxlint/commit/cfc0bac8f97b559243cef1ee6cdc4119aeda389a))
* add multi-provider support (OpenAI, Ollama) with dependency injection ([83db8da](https://github.com/GyeongHoKim/uxlint/commit/83db8da1e5389389161c35842fcb9026977cbfb2)), closes [#17](https://github.com/GyeongHoKim/uxlint/issues/17)
* add xAI (Grok) provider support ([442cd6d](https://github.com/GyeongHoKim/uxlint/commit/442cd6d5087267e01cec9f25c76d6cac924cee2b))

# [2.0.0](https://github.com/GyeongHoKim/uxlint/compare/v1.0.0...v2.0.0) (2025-11-06)

### Bug Fixes

- address PR review - implement MCP_SERVER_ARGS and eliminate type bypasses ([10bd134](https://github.com/GyeongHoKim/uxlint/commit/10bd134e87a883fb2f77a994e44de5b8413a358a))
- eliminate code quality bypasses and address PR review feedback ([a52b110](https://github.com/GyeongHoKim/uxlint/commit/a52b11093e5ccb9241f837eded84b27a96ceb0be))
- enable multi-turn tool calling with maxSteps ([df405d1](https://github.com/GyeongHoKim/uxlint/commit/df405d15fc019dc6fc87c51aa088787c0c6e8483))
- mcp server args in the test code ([4135ec0](https://github.com/GyeongHoKim/uxlint/commit/4135ec0c3722debc23e1856a3fa9c5e2d868377e))
- mcp server argument error ([8741d47](https://github.com/GyeongHoKim/uxlint/commit/8741d47baddeeb59b6b3d5e9dc78f20eb0e56bd2))

### Features

- implement MCP tool calling for LLM analysis ([15f76e7](https://github.com/GyeongHoKim/uxlint/commit/15f76e7d3e62ea6a67e326400d33e37222d6b7ae))
- mcp client retry logic added ([ed4c1db](https://github.com/GyeongHoKim/uxlint/commit/ed4c1dbf4ae9fff757cfd7b338b2e928668823f0))
- migrate to @ai-sdk/mcp official integration ([05d4e35](https://github.com/GyeongHoKim/uxlint/commit/05d4e358727db421f3964d2c730b5881d34631e0))

### BREAKING CHANGES

- Tool calling now works in multi-turn mode
  instead of single-step mode, enabling proper MCP integration
- LLM now performs page navigation and capture
  via tools instead of manual pre-capture

# 1.0.0 (2025-10-14)

### Bug Fixes

- add report file writing and exit handling ([cb97498](https://github.com/GyeongHoKim/uxlint/commit/cb974988a9fdefea614b744c62e93837e7691d65))
- ava/[#3349](https://github.com/GyeongHoKim/uxlint/issues/3349) ([38a3e44](https://github.com/GyeongHoKim/uxlint/commit/38a3e444fb57585f99e838e3e0b5267f656efade))
- force exit because of jest issue [#14719](https://github.com/GyeongHoKim/uxlint/issues/14719) ([13b2a9d](https://github.com/GyeongHoKim/uxlint/commit/13b2a9d421a8fd37bdf1bc0fc232fc5974fd2c89))
- lint error fixed ([b097cc8](https://github.com/GyeongHoKim/uxlint/commit/b097cc89a89bd9d20f594b94c0d0f088c9f8d554))
- lint errors ([bac609c](https://github.com/GyeongHoKim/uxlint/commit/bac609c485d236832cf080e349c90d0c566969b7))
- **wizard:** unrequired field redundant word, yaml file export bug ([f4d5e2c](https://github.com/GyeongHoKim/uxlint/commit/f4d5e2c89fb12ddef8b2a31ba8325caff30b9993))

### Features

- added config loader ([1407d4e](https://github.com/GyeongHoKim/uxlint/commit/1407d4e0f4d7ac3653afd2e4cea481b91b9c8bf2))
- **ai:** integrate Vercel AI SDK for UX analysis ([55d7c74](https://github.com/GyeongHoKim/uxlint/commit/55d7c74813d035a7294bca500991640923dd0ce2))
- **analysis:** implement AI service and report generator (Green phase) ([aa38707](https://github.com/GyeongHoKim/uxlint/commit/aa38707d3348b917cd0e5937c5eda87e9b5dfd91))
- **analysis:** implement foundational models and environment config ([10ddeb4](https://github.com/GyeongHoKim/uxlint/commit/10ddeb41257fa1436bfa808873cf855cc022a202))
- **app:** integrate AnalysisRunner into analysis mode ([4ea58cf](https://github.com/GyeongHoKim/uxlint/commit/4ea58cf3081810b00c4505ad78aa1cec49e7fdd2))
- **cli:** add analysis mode detection and environment validation ([8d54e55](https://github.com/GyeongHoKim/uxlint/commit/8d54e556bb4e1274bb62f70a521ccd485f0c1014))
- **components:** implement AnalysisProgress component (T053-T054) ([dc4dd46](https://github.com/GyeongHoKim/uxlint/commit/dc4dd464e49816d02a41b6b0efc389d38ba70ab8))
- **components:** implement AnalysisRunner component (T056 - Green phase) ([54afb65](https://github.com/GyeongHoKim/uxlint/commit/54afb65cea1352c6f5e5dacfacb2393d09841435))
- **config:** add config builder ([53f4034](https://github.com/GyeongHoKim/uxlint/commit/53f40345430a79e258dfb22c8b13d830dfcacf23))
- header component ([aa76b82](https://github.com/GyeongHoKim/uxlint/commit/aa76b82ad1196b29f8515e46db507a1a2001f046))
- **hooks:** implement useAnalysis hook for multi-page analysis (T049-T052) ([7183d07](https://github.com/GyeongHoKim/uxlint/commit/7183d0799ebad89bd5b030ce1ca723c079835b69))
- implement core models for CLI interface ([2d91e44](https://github.com/GyeongHoKim/uxlint/commit/2d91e4451a51aeab65a3f4e82034f66d74665d80))
- **mcp:** add parameterized inspection with validation ([db624ba](https://github.com/GyeongHoKim/uxlint/commit/db624ba9477c3532523dee5187b2369d70e44aea))
- **mcp:** add Playwright browser automation support ([f4b14a7](https://github.com/GyeongHoKim/uxlint/commit/f4b14a771e16079895ef084bcdfb52eb1a9f2dcf))
- **mcp:** add session management and persistence tracking ([8bbf59e](https://github.com/GyeongHoKim/uxlint/commit/8bbf59e6a924a850910460b02b747795eede147d))
- **mcp:** implement response parsing for Playwright MCP client ([e641b12](https://github.com/GyeongHoKim/uxlint/commit/e641b12455b4f262d2850bd2faca9182a49e2e74))
- **services:** implement MCP page capture service ([cc1b7b4](https://github.com/GyeongHoKim/uxlint/commit/cc1b7b47cd61d8a59ec454d24dd65ff7f7bcd3e6))
- user input component ([494aad0](https://github.com/GyeongHoKim/uxlint/commit/494aad01843420f9371980bc1e966201e1ef9be4))
- uxlint config model ([f549475](https://github.com/GyeongHoKim/uxlint/commit/f549475ce4c45cc07f48ba2f53a5201c52b99b9c))
- **wizard:** add types and validation for interactive config wizard ([1589cfd](https://github.com/GyeongHoKim/uxlint/commit/1589cfd302d43d470fb9a3bf79cbcc8329de8427))
- **wizard:** add wrapper hook for wizard state ([d2aac60](https://github.com/GyeongHoKim/uxlint/commit/d2aac60a48b937823ebd00e57794a3fd2ace3e84))
- **wizard:** ui for interactive configuration wizard ([0c000b4](https://github.com/GyeongHoKim/uxlint/commit/0c000b42f870ad2a55a8f26bca7228055af5906f))
