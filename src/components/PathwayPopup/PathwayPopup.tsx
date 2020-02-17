import React, { FC, ReactElement } from 'react';
import { Popup, StrictPopupProps } from 'semantic-ui-react';
import styles from './PathwayPopup.module.scss';
import { classNames } from 'react-select/src/utils';

interface PathwayPopupProps {
  Content: ReactElement;
  Trigger: ReactElement;
  popupPosition: StrictPopupProps['position'];
  open: boolean;
  setOpen: Function;
  className?: string;
}

const PathwayPopup: FC<PathwayPopupProps> = ({
  Content,
  Trigger,
  popupPosition,
  open,
  setOpen,
  className
}: PathwayPopupProps) => {
  return (
    <Popup
      content={Content}
      position={popupPosition || 'bottom center'}
      className={`${styles.pathwayPopup} ${className}`}
      on="click"
      open={open}
      onOpen={(): void => {
        setOpen(true);
      }}
      onClose={(): void => {
        setOpen(false);
      }}
      pinned
      trigger={Trigger}
    />
  );
};

export default PathwayPopup;
