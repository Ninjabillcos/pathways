import React, { FC, useState } from 'react';
import styles from './MissingDataPopup.module.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import PathwayPopup from '../PathwayPopup/PathwayPopup';
import nodeClasses from '../ExpandedNode/ExpandedNode.module.scss';
import ActionButton from '../ActionButton/ActionButton';

interface MissingDataPopup {
  values: string[];
}

const MissingDataPopup: FC<MissingDataPopup> = ({ values }) => {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <PathwayPopup
      Content={<PopupContent values={values} setOpen={setOpen}></PopupContent>}
      className={styles.missingDataPopup}
      Trigger={
        <div className={styles.popupWrapper}>
          missing data
          <FontAwesomeIcon icon="edit" className={nodeClasses.externalLink} />
        </div>
      }
      popupPosition="bottom right"
      open={open}
      setOpen={setOpen}
    />
  );
};

interface PopupContentProps {
  values: Array<string>;
  setOpen: Function;
}

const PopupContent: FC<PopupContentProps> = ({ values, setOpen }) => {
  const [showCheck, setShowCheck] = useState<boolean>(false);
  const [selected, setSelected] = useState<string>('');
  return (
    <div>
      <div className={styles.popupContent}>
        Select Value:
        <div>
          {values.map(e => {
            return (
              <div
                key={e}
                className={styles.popupChoice + ' ' + (selected === e ? styles.selected : '')}
                onClick={(): void => {
                  if (showCheck && selected === e) {
                    setShowCheck(false);
                    setSelected('');
                  } else {
                    setShowCheck(true);
                    setSelected(e);
                  }
                }}
              >
                {e}
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.footer}>
        <ActionButton size="small" type="decline" onClick={(): void => setOpen(false)} />
        {showCheck && (
          <ActionButton size="small" type="accept" onClick={(): void => setOpen(false)} />
        )}
      </div>
    </div>
  );
};

export default MissingDataPopup;
