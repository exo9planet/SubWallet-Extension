// Copyright 2019-2022 @polkadot/extension-koni-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ThemeProps } from '../types';

import React, { MouseEventHandler } from 'react';
import styled from 'styled-components';

import ActionText from '@polkadot/extension-koni-ui/components/ActionText';
import TextAreaWithLabel from '@polkadot/extension-koni-ui/components/TextAreaWithLabel';

import clone from '../assets/clone.svg';
import download from '../assets/icon/download.svg';
import useTranslation from '../hooks/useTranslation';

interface Props {
  seed: string;
  onCopy: MouseEventHandler<HTMLDivElement>;
  className?: string;
  isShowDownloadButton?: boolean;
  backupMnemonicSeed?: MouseEventHandler<HTMLDivElement>;
}

function MnemonicSeed ({ backupMnemonicSeed, className, isShowDownloadButton, onCopy, seed }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <TextAreaWithLabel
        className={`mnemonicDisplay ${isShowDownloadButton ? 'mnemonic-display-download-btn' : ''}`}
        isReadOnly
        label={t<string>('Generated 12-word mnemonic seed:')}
        value={seed}
      />
      {isShowDownloadButton && <div
        className='download-button'
        onClick={backupMnemonicSeed}
      >
        <img
          alt='download'
          src={download}
        />
      </div>}
      <div className='buttonsRow'>
        <ActionText
          className='copyBtn'
          data-seed-action='copy'
          img={clone}
          onClick={onCopy}
          text={t<string>('Copy to clipboard')}
        />
      </div>
    </div>
  );
}

export default styled(MnemonicSeed)(({ theme }: ThemeProps) => `
  position: relative;
  margin-top: 7px;
  margin-bottom: 12px;

  .buttonsRow {
    display: flex;
    flex-direction: row;
    margin-top: 15px;

    .copyBtn {
      margin-right: 32px;
      display: flex;
      align-items: center;
      > span {
        font-size: 15px;
        line-height: 24px;
        color: ${theme.textColor}
      }
    }
  }

  .download-button {
    display: flex;
    position: absolute;
    top: 55px;
    right: 15px;
    cursor: pointer;
  }

  .mnemonicDisplay {
    textarea {
      color: ${theme.textColor3};
      font-size: ${theme.fontSize};
      height: unset;
      letter-spacing: -0.01em;
      line-height: ${theme.lineHeight};
      margin-bottom: 10px;
      padding: 9px 16px;
      background-color: ${theme.backgroundAccountAddress}
    }
  }

  .mnemonic-display-download-btn textarea {
    padding-right: 50px;
  }
`);