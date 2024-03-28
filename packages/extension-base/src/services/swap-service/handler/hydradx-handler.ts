// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { PoolService, TradeRouter } from '@galacticcouncil/sdk';
import { COMMON_CHAIN_SLUGS } from '@subwallet/chain-list';
import { SwapError } from '@subwallet/extension-base/background/errors/SwapError';
import { TransactionError } from '@subwallet/extension-base/background/errors/TransactionError';
import { AmountData } from '@subwallet/extension-base/background/KoniTypes';
import { createXcmExtrinsic } from '@subwallet/extension-base/koni/api/xcm';
import { BalanceService } from '@subwallet/extension-base/services/balance-service';
import { ChainService } from '@subwallet/extension-base/services/chain-service';
import { _getAssetDecimals, _getChainNativeTokenSlug, _getTokenMinAmount, _getTokenOnChainAssetId, _isNativeToken } from '@subwallet/extension-base/services/chain-service/utils';
import { SwapBaseHandler, SwapBaseInterface } from '@subwallet/extension-base/services/swap-service/handler/base-handler';
import { calculateSwapRate, getEarlyHydradxValidationError, getSwapAlternativeAsset, SWAP_QUOTE_TIMEOUT_MAP } from '@subwallet/extension-base/services/swap-service/utils';
import { RuntimeDispatchInfo, YieldStepType } from '@subwallet/extension-base/types';
import { BaseStepDetail } from '@subwallet/extension-base/types/service-base';
import { HydradxPreValidationMetadata, OptimalSwapPath, OptimalSwapPathParams, SwapEarlyValidation, SwapErrorType, SwapFeeInfo, SwapFeeType, SwapProviderId, SwapQuote, SwapRequest, SwapStepType, SwapSubmitParams, SwapSubmitStepData, ValidateSwapProcessParams } from '@subwallet/extension-base/types/swap';
import BigNumber from 'bignumber.js';

export class HydradxHandler implements SwapBaseInterface {
  private swapBaseHandler: SwapBaseHandler;
  private tradeRouter: TradeRouter | undefined;
  private readonly isTestnet: boolean;
  public isReady = false;

  constructor (chainService: ChainService, balanceService: BalanceService, isTestnet = true) { // todo: pass in baseHandler from service
    this.swapBaseHandler = new SwapBaseHandler({
      balanceService,
      chainService,
      providerName: isTestnet ? 'HydraDX Testnet' : 'HydraDX',
      providerSlug: isTestnet ? SwapProviderId.HYDRADX_TESTNET : SwapProviderId.HYDRADX_MAINNET
    });

    this.isTestnet = isTestnet;
  }

  public async init (): Promise<void> {
    const chainState = this.chainService.getChainStateByKey(this.chain);

    if (!chainState.active) {
      await this.chainService.enableChain(this.chain);
    }

    const substrateApi = this.chainService.getSubstrateApi(this.chain);

    await substrateApi.api.isReady;
    const poolService = new PoolService(substrateApi.api);

    this.tradeRouter = new TradeRouter(poolService);

    this.isReady = true;
  }

  get chain () { // TODO: check origin chain of tokens in swap pair to determine support
    if (!this.isTestnet) {
      return COMMON_CHAIN_SLUGS.HYDRADX;
    } else {
      return COMMON_CHAIN_SLUGS.HYDRADX_TESTNET;
    }
  }

  get chainService () {
    return this.swapBaseHandler.chainService;
  }

  get balanceService () {
    return this.swapBaseHandler.balanceService;
  }

  get providerInfo () {
    return this.swapBaseHandler.providerInfo;
  }

  get name () {
    return this.swapBaseHandler.name;
  }

  get slug () {
    return this.swapBaseHandler.slug;
  }

  async getXcmStep (params: OptimalSwapPathParams): Promise<[BaseStepDetail, SwapFeeInfo] | undefined> {
    const bnAmount = new BigNumber(params.request.fromAmount);
    const fromAsset = this.chainService.getAssetBySlug(params.request.pair.from);

    const fromAssetBalance = await this.balanceService.getTokenFreeBalance(params.request.address, fromAsset.originChain, fromAsset.slug);

    const bnFromAssetBalance = new BigNumber(fromAssetBalance.value);

    if (!bnFromAssetBalance.gte(bnAmount)) { // if not enough balance
      const alternativeAssetSlug = getSwapAlternativeAsset(params.request.pair);

      if (alternativeAssetSlug) {
        const alternativeAsset = this.chainService.getAssetBySlug(alternativeAssetSlug);
        const alternativeAssetBalance = await this.balanceService.getTokenFreeBalance(params.request.address, alternativeAsset.originChain, alternativeAsset.slug);
        const bnAlternativeAssetBalance = new BigNumber(alternativeAssetBalance.value);

        if (bnAlternativeAssetBalance.gt(0)) {
          const alternativeChainInfo = this.chainService.getChainInfoByKey(alternativeAsset.originChain);
          const step: BaseStepDetail = {
            metadata: {
              sendingValue: bnAmount.toString(),
              originTokenInfo: alternativeAsset,
              destinationTokenInfo: fromAsset
            },
            name: `Transfer ${alternativeAsset.symbol} from ${alternativeChainInfo.name}`,
            type: YieldStepType.XCM
          };

          const xcmOriginSubstrateApi = await this.chainService.getSubstrateApi(alternativeAsset.originChain).isReady;

          const xcmTransfer = await createXcmExtrinsic({
            originTokenInfo: alternativeAsset,
            destinationTokenInfo: fromAsset,
            sendingValue: bnAmount.toString(),
            recipient: params.request.address,
            chainInfoMap: this.chainService.getChainInfoMap(),
            substrateApi: xcmOriginSubstrateApi
          });

          const _xcmFeeInfo = await xcmTransfer.paymentInfo(params.request.address);
          const xcmFeeInfo = _xcmFeeInfo.toPrimitive() as unknown as RuntimeDispatchInfo;

          const fee: SwapFeeInfo = {
            feeComponent: [{
              feeType: SwapFeeType.NETWORK_FEE,
              amount: Math.round(xcmFeeInfo.partialFee * 1.2).toString(),
              tokenSlug: _getChainNativeTokenSlug(alternativeChainInfo)
            }],
            defaultFeeToken: _getChainNativeTokenSlug(alternativeChainInfo),
            feeOptions: [_getChainNativeTokenSlug(alternativeChainInfo)]
          };

          return [step, fee];
        }
      }
    }

    return undefined;
  }

  async getSubmitStep (params: OptimalSwapPathParams): Promise<[BaseStepDetail, SwapFeeInfo] | undefined> {
    if (params.selectedQuote) {
      const submitStep = {
        name: 'Swap',
        type: SwapStepType.SWAP
      };

      return Promise.resolve([submitStep, params.selectedQuote.feeInfo]);
    }

    return Promise.resolve(undefined);
  }

  generateOptimalProcess (params: OptimalSwapPathParams): Promise<OptimalSwapPath> {
    return this.swapBaseHandler.generateOptimalProcess(params, [
      this.getXcmStep,
      this.getSubmitStep
    ]);
  }

  async getSwapQuote (request: SwapRequest): Promise<SwapQuote | SwapError> {
    const fromAsset = this.chainService.getAssetBySlug(request.pair.from);
    const toAsset = this.chainService.getAssetBySlug(request.pair.to);
    const fromChain = this.chainService.getChainInfoByKey(fromAsset.originChain);
    const fromChainNativeTokenSlug = _getChainNativeTokenSlug(fromChain);

    if (!this.isReady || !this.tradeRouter) {
      return new SwapError(SwapErrorType.UNKNOWN);
    }

    const earlyValidation = await this.validateSwapRequest(request);

    if (earlyValidation.error) {
      const metadata = earlyValidation.metadata as HydradxPreValidationMetadata;

      return getEarlyHydradxValidationError(earlyValidation.error, metadata);
    }

    try {
      // const quoteResponse = await this.tradeRouter.getBestSell(fromAssetId, toAssetId, request.fromAmount);
      //
      // console.log('quoteResponse hdx', quoteResponse);

      const defaultFeeToken = _isNativeToken(fromAsset) ? fromAsset.slug : fromChainNativeTokenSlug;

      const toAmount = '100000000000';

      return {
        pair: request.pair,
        fromAmount: request.fromAmount,
        toAmount: toAmount,
        rate: calculateSwapRate(request.fromAmount, toAmount, fromAsset, toAsset),
        provider: this.providerInfo,
        aliveUntil: +Date.now() + (SWAP_QUOTE_TIMEOUT_MAP[this.slug] || SWAP_QUOTE_TIMEOUT_MAP.default), // todo: ask HydraDX team
        feeInfo: { // todo: parse fee options
          feeComponent: [],
          defaultFeeToken,
          feeOptions: [defaultFeeToken]
        },
        route: { // todo: parse swap path
          path: []
        }
      } as SwapQuote;
    } catch (e) {
      console.error('getSwapQuote error', e);

      return new SwapError(SwapErrorType.ERROR_FETCHING_QUOTE);
    }
  }

  handleSubmitStep (params: SwapSubmitParams): Promise<SwapSubmitStepData> {
    return Promise.resolve(undefined);
  }

  handleSwapProcess (params: SwapSubmitParams): Promise<SwapSubmitStepData> {
    return Promise.resolve(undefined);
  }

  validateSwapProcess (params: ValidateSwapProcessParams): Promise<TransactionError[]> {
    return Promise.resolve([]);
  }

  public async validateSwapRequest (request: SwapRequest): Promise<SwapEarlyValidation> {
    const fromAsset = this.chainService.getAssetBySlug(request.pair.from);
    const toAsset = this.chainService.getAssetBySlug(request.pair.to);

    const fromAssetId = _getTokenOnChainAssetId(fromAsset);
    const toAssetId = _getTokenOnChainAssetId(toAsset);

    if (!(fromAsset.originChain === this.chain && toAsset.originChain === this.chain)) {
      return {
        error: SwapErrorType.ASSET_NOT_SUPPORTED
      };
    }

    if (!fromAssetId || !toAssetId) {
      return {
        error: SwapErrorType.UNKNOWN
      };
    }

    try {
      const fromAssetBalance = await this.balanceService.getTokenFreeBalance(request.address, fromAsset.originChain, fromAsset.slug);

      const bnAmount = new BigNumber(request.fromAmount);
      const bnSrcAssetMinAmount = new BigNumber(_getTokenMinAmount(fromAsset));
      const bnMaxBalanceSwap = new BigNumber(fromAssetBalance.value).minus(bnSrcAssetMinAmount);

      if (bnAmount.lte(0)) {
        return {
          error: SwapErrorType.AMOUNT_CANNOT_BE_ZERO
        };
      }

      if (bnAmount.gte(bnMaxBalanceSwap)) {
        return {
          error: SwapErrorType.SWAP_EXCEED_ALLOWANCE
        };
      }

      return {
        metadata: {
          chain: this.chainService.getChainInfoByKey(this.chain),
          maxSwap: {
            value: bnMaxBalanceSwap.toString(),
            decimals: _getAssetDecimals(fromAsset),
            symbol: fromAsset.symbol
          } as AmountData
        } as HydradxPreValidationMetadata
      };
    } catch (e) {
      return {
        error: SwapErrorType.UNKNOWN
      };
    }
  }
}
