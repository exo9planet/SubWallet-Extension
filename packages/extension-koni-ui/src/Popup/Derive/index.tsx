// Copyright 2019-2022 @polkadot/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { canDerive } from '@subwallet/extension-base/utils';
import { Header } from '@subwallet/extension-koni-ui/partials';
import { EVM_ACCOUNT_TYPE } from '@subwallet/extension-koni-ui/Popup/CreateAccount';
import AddressDropdown from '@subwallet/extension-koni-ui/Popup/Derive/AddressDropdown';
import CN from 'classnames';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import styled from 'styled-components';

import { AccountContext, ActionContext, ButtonArea, Checkbox, Label, NextStepButton } from '../../components';
import useTranslation from '../../hooks/useTranslation';
import { deriveAccountV3 } from '../../messaging';

interface Props {
  className?: string;
}

function Derive ({ className }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const onAction = useContext(ActionContext);
  const { accounts } = useContext(AccountContext);
  const [isBusy, setIsBusy] = useState(false);
  const [isConnectWhenDerive, setConnectWhenDerive] = useState(true);
  const [parentAddress, setParentAddress] = useState('');

  const _onParentChange = useCallback((address: string) => {
    setParentAddress(address);
  }, []);

  const _onCreate = useCallback(() => {
    if (!parentAddress) {
      return;
    }

    setIsBusy(true);
    deriveAccountV3({
      address: parentAddress,
      isAllowed: isConnectWhenDerive
    })
      .then(() => {
        window.localStorage.setItem('popupNavigation', '/');
        onAction('/');
      })
      .catch((error): void => {
        setIsBusy(false);
        console.error(error);
      });
  }, [isConnectWhenDerive, onAction, parentAddress]);

  const allAddresses = useMemo(
    () => accounts
      .filter(({ isExternal }) => !isExternal)
      .filter(({ isMasterAccount, type }) => canDerive(type) && (type !== EVM_ACCOUNT_TYPE || (isMasterAccount && type === EVM_ACCOUNT_TYPE)))
      .map(({ address, genesisHash }): [string, string | null] => [address, genesisHash || null]),
    [accounts]
  );

  return (
    <div className={className}>
      <Header
        isBusy={isBusy}
        showBackArrow={true}
        showSubHeader={true}
        subHeaderName={t<string>('Derive account')}
      />
      <div className={CN('body-container')}>
        <div className='derive-account'>
          <Label label={t<string>('Choose Parent Account:')}>
            <AddressDropdown
              allAddresses={allAddresses}
              onSelect={_onParentChange}
              selectedAddress={parentAddress}
            />
          </Label>
        </div>

        <Checkbox
          checked={isConnectWhenDerive}
          label={t<string>('Auto connect to all DApps after create')}
          onChange={setConnectWhenDerive}
        />
        <ButtonArea>
          <NextStepButton
            className='next-step-btn'
            data-button-action='create derived account'
            isBusy={isBusy}
            isDisabled={!parentAddress}
            onClick={_onCreate}
          >
            {t<string>('Create a derived account')}
          </NextStepButton>
        </ButtonArea>
      </div>
    </div>
  );
}

export default styled(React.memo(Derive))`
  .body-container {
    padding: 25px 15px 15px;
    flex: 1;
    overflow-y: auto;

    .next-step-btn {
      > .children {
        display: flex;
        align-items: center;
        position: relative;
        justify-content: center;
      }
    }

    .select-parent-warning {
      margin-top: 10px;
    }
  }
`;
