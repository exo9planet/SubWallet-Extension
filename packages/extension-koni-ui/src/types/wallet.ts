// Copyright 2019-2022 @subwallet/extension-koni-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { SubWalletEvmProvider } from '@subwallet/extension-base/page/SubWalleEvmProvider';
import { EvmProvider, InjectedWindowProvider } from '@subwallet/extension-inject/types';

export interface WalletInfo {
  description: string;
  evmKey: string | null;
  icon: string;
  key: string;
  name: string;
  substrateKey: string | null;
  url: string;
}

type This = typeof globalThis;

export interface InjectedWindow extends This {
  injectedWeb3?: Record<string, InjectedWindowProvider>;
  ethereum?: EvmProvider;
  SubWallet?: SubWalletEvmProvider;
}