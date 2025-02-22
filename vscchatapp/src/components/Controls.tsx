/*
********************************************
 Copyright © 2021 Agora Lab, Inc., all rights reserved.
 AppBuilder and all associated components, source code, APIs, services, and documentation 
 (the “Materials”) are owned by Agora Lab, Inc. and its licensors. The Materials may not be 
 accessed, used, modified, or distributed for any purpose without a license from Agora Lab, Inc.  
 Use without a license or in violation of any license terms and conditions (including use for 
 any purpose competitive to Agora Lab, Inc.’s business) is strictly prohibited. For more 
 information visit https://appbuilder.agora.io. 
*********************************************
*/
import React, {
  useState,
  useContext,
  useEffect,
  useRef,
  useReducer,
} from 'react';
import {View, StyleSheet, useWindowDimensions} from 'react-native';
import {
  DispatchContext,
  PropsContext,
  ToggleState,
  useLocalUid,
} from '../../agora-rn-uikit';
import LocalAudioMute from '../subComponents/LocalAudioMute';
import LocalVideoMute from '../subComponents/LocalVideoMute';
import Recording from '../subComponents/Recording';
import LocalSwitchCamera from '../subComponents/LocalSwitchCamera';
import ScreenshareButton from '../subComponents/screenshare/ScreenshareButton';
import isMobileOrTablet from '../utils/isMobileOrTablet';
import {ClientRoleType} from '../../agora-rn-uikit';
import LiveStreamControls from './livestream/views/LiveStreamControls';
import {
  BREAKPOINTS,
  CustomToolbarSort,
  isWeb,
  isWebInternal,
  useIsDesktop,
  updateToolbarDefaultConfig,
} from '../utils/common';
import {RoomInfoContextInterface, useRoomInfo} from './room-info/useRoomInfo';
import LocalEndcall from '../subComponents/LocalEndCall';
import LayoutIconButton from '../subComponents/LayoutIconButton';
import CopyJoinInfo from '../subComponents/CopyJoinInfo';
import IconButton from '../atoms/IconButton';
import ActionMenu, {ActionMenuItem} from '../atoms/ActionMenu';
import useLayoutsData from '../pages/video-call/useLayoutsData';
import {
  ChatType,
  SidePanelType,
  useChatUIControls,
  useContent,
  useLayout,
  useRecording,
  useSidePanel,
} from 'customization-api';
import {useVideoCall} from './useVideoCall';
import {useScreenshare} from '../subComponents/screenshare/useScreenshare';
import LayoutIconDropdown from '../subComponents/LayoutIconDropdown';
import {useCaption} from '../../src/subComponents/caption/useCaption';
import LanguageSelectorPopup from '../../src/subComponents/caption/LanguageSelectorPopup';
import useSTTAPI from '../../src/subComponents/caption/useSTTAPI';
import {EventNames} from '../rtm-events';
import events, {PersistanceLevel} from '../rtm-events-api';
import Toast from '../../react-native-toast-message';
import {getLanguageLabel} from '../../src/subComponents/caption/utils';
import ImageIcon from '../atoms/ImageIcon';
import useGetName from '../utils/useGetName';
import Toolbar from '../atoms/Toolbar';
import ToolbarItem from '../atoms/ToolbarItem';
import {
  ToolbarCustomItem,
  ToolbarDefaultItem,
  ToolbarDefaultItemConfig,
} from '../atoms/ToolbarPreset';

import {BoardColor, whiteboardContext} from './whiteboard/WhiteboardConfigure';
import {RoomPhase} from 'white-web-sdk';
import {useNoiseSupression} from '../app-state/useNoiseSupression';

import {useVB} from './virtual-background/useVB';
import WhiteboardWrapper from './whiteboard/WhiteboardWrapper';
import isSDK from '../utils/isSDK';
import LocalEventEmitter, {
  LocalEventsEnum,
} from '../rtm-events-api/LocalEvents';
import {useSetRoomInfo} from './room-info/useSetRoomInfo';
import {useString} from '../utils/useString';
import {
  sttSpokenLanguageToastHeading,
  sttSpokenLanguageToastSubHeading,
  toolbarItemCaptionText,
  toolbarItemChatText,
  toolbarItemInviteText,
  toolbarItemLayoutText,
  toolbarItemMoreText,
  toolbarItemNoiseCancellationText,
  toolbarItemPeopleText,
  toolbarItemRecordingText,
  toolbarItemViewRecordingText,
  toolbarItemSettingText,
  toolbarItemShareText,
  toolbarItemTranscriptText,
  toolbarItemVirtualBackgroundText,
  toolbarItemWhiteboardText,
} from '../language/default-labels/videoCallScreenLabels';
import {LogSource, logger} from '../logger/AppBuilderLogger';
import {useModal} from '../utils/useModal';
import ViewRecordingsModal from './recordings/ViewRecordingsModal';

export const useToggleWhiteboard = () => {
  const {
    whiteboardActive,
    joinWhiteboardRoom,
    leaveWhiteboardRoom,
    getWhiteboardUid,
  } = useContext(whiteboardContext);
  const {setCustomContent} = useContent();
  const {setLayout} = useLayout();
  const {dispatch} = useContext(DispatchContext);
  return () => {
    if ($config.ENABLE_WHITEBOARD) {
      if (whiteboardActive) {
        leaveWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), false);
        setLayout('grid');
        events.send(
          EventNames.WHITEBOARD_ACTIVE,
          JSON.stringify({status: false}),
          PersistanceLevel.Session,
        );
      } else {
        joinWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), WhiteboardWrapper, {}, true);
        dispatch({
          type: 'UserPin',
          value: [getWhiteboardUid()],
        });
        setLayout('pinned');
        events.send(
          EventNames.WHITEBOARD_ACTIVE,
          JSON.stringify({status: true}),
          PersistanceLevel.Session,
        );
      }
    }
  };
};

export const WhiteboardListener = () => {
  const {dispatch} = useContext(DispatchContext);
  const {setCustomContent} = useContent();
  const {currentLayout, setLayout} = useLayout();
  const {
    data: {isHost},
    isWhiteBoardOn,
  } = useRoomInfo();

  React.useEffect(() => {
    if ($config.ENABLE_WAITING_ROOM && !isHost) {
      if (isWhiteBoardOn) {
        WhiteboardStartedCallBack();
      } else {
        WhiteboardStoppedCallBack();
      }
    }
  }, [isWhiteBoardOn, isHost]);

  const WhiteboardCallBack = ({status}) => {
    if (status) {
      WhiteboardStartedCallBack();
    } else {
      WhiteboardStoppedCallBack();
    }
  };

  useEffect(() => {
    if (
      !$config.ENABLE_WAITING_ROOM ||
      ($config.ENABLE_WAITING_ROOM && isHost)
    ) {
      LocalEventEmitter.on(
        LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
        WhiteboardCallBack,
      );

      return () => {
        LocalEventEmitter.on(
          LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
          WhiteboardCallBack,
        );
      };
    }
  }, [isHost]);

  //whiteboard start

  const {
    whiteboardActive,
    joinWhiteboardRoom,
    leaveWhiteboardRoom,
    getWhiteboardUid,
  } = useContext(whiteboardContext);

  const WhiteboardStoppedCallBack = () => {
    toggleWhiteboard(true, false);
  };

  const WhiteboardStartedCallBack = () => {
    toggleWhiteboard(false, false);
  };

  useEffect(() => {
    whiteboardActive && currentLayout !== 'pinned' && setLayout('pinned');
  }, []);

  const toggleWhiteboard = (
    whiteboardActive: boolean,
    triggerEvent: boolean,
  ) => {
    if ($config.ENABLE_WHITEBOARD) {
      if (whiteboardActive) {
        leaveWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), false);
        setLayout('grid');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: false}),
            PersistanceLevel.Session,
          );
      } else {
        joinWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), WhiteboardWrapper, {}, true);
        dispatch({
          type: 'UserPin',
          value: [getWhiteboardUid()],
        });
        setLayout('pinned');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: true}),
            PersistanceLevel.Session,
          );
      }
    }
  };
  return null;
};

const MoreButton = () => {
  const noiseCancellationLabel = useString(toolbarItemNoiseCancellationText)();
  const whiteboardLabel = useString<boolean>(toolbarItemWhiteboardText);
  const captionLabel = useString<boolean>(toolbarItemCaptionText);
  const transcriptLabel = useString<boolean>(toolbarItemTranscriptText);
  const settingsLabel = useString(toolbarItemSettingText)();
  const screenShareButton = useString<boolean>(toolbarItemShareText);
  const recordingButton = useString<boolean>(toolbarItemRecordingText);
  const viewRecordingsLabel = useString<boolean>(
    toolbarItemViewRecordingText,
  )();
  const moreButtonLabel = useString(toolbarItemMoreText)();
  const virtualBackgroundLabel = useString(toolbarItemVirtualBackgroundText)();
  const chatLabel = useString(toolbarItemChatText)();
  const inviteLabel = useString(toolbarItemInviteText)();
  const peopleLabel = useString(toolbarItemPeopleText)();
  const layoutLabel = useString(toolbarItemLayoutText)();
  const {dispatch} = useContext(DispatchContext);
  const {rtcProps} = useContext(PropsContext);
  const {setCustomContent} = useContent();
  const [_, setActionMenuVisible] = React.useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isHoveredOnModal, setIsHoveredOnModal] = useState(false);
  const {
    modalOpen: isVRModalOpen,
    setModalOpen: setVRModalOpen,
    toggle: toggleVRModal,
  } = useModal();
  const moreBtnRef = useRef(null);
  const {width: globalWidth, height: globalHeight} = useWindowDimensions();
  const layouts = useLayoutsData();
  const {currentLayout, setLayout} = useLayout();
  const layout = layouts.findIndex(item => item.name === currentLayout);
  const {setSidePanel, sidePanel} = useSidePanel();
  const {
    isCaptionON,
    setIsCaptionON,
    language: prevLang,
    isSTTActive,
    setIsSTTActive,
    isSTTError,
  } = useCaption();

  const isTranscriptON = sidePanel === SidePanelType.Transcript;

  const [isLanguagePopupOpen, setLanguagePopup] =
    React.useState<boolean>(false);
  const isFirstTimePopupOpen = React.useRef(false);
  const STT_clicked = React.useRef(null);

  const {start, restart} = useSTTAPI();
  const {
    data: {isHost},
  } = useRoomInfo();
  const {setShowInvitePopup, setShowStopRecordingPopup, setShowLayoutOption} =
    useVideoCall();
  const {isScreenshareActive, startScreenshare, stopScreenshare} =
    useScreenshare();
  const {isRecordingActive, startRecording, inProgress} = useRecording();
  const {setChatType} = useChatUIControls();
  const actionMenuitems: ActionMenuItem[] = [];

  const {isNoiseSupressionEnabled, setNoiseSupression} = useNoiseSupression();

  //AINS
  if ($config.ENABLE_NOISE_CANCELLATION) {
    actionMenuitems.push({
      toggleStatus: isNoiseSupressionEnabled === ToggleState.enabled,
      disabled:
        isNoiseSupressionEnabled === ToggleState.disabling ||
        isNoiseSupressionEnabled === ToggleState.enabling,
      isBase64Icon: true,
      //@ts-ignore
      icon: 'noise-cancellation',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: noiseCancellationLabel,
      //isNoiseSupressionEnabled === ToggleState.enabled
      callback: () => {
        setActionMenuVisible(false);
        setNoiseSupression(p => !p);
      },
    });
  }
  //AINS

  //virtual background
  const {isVBActive, setIsVBActive} = useVB();

  const toggleVB = () => {
    if (isVBActive) {
      setSidePanel(SidePanelType.None);
    } else {
      setSidePanel(SidePanelType.VirtualBackground);
    }
    setIsVBActive(prev => !prev);
  };
  if ($config.ENABLE_VIRTUAL_BACKGROUND && !$config.AUDIO_ROOM) {
    actionMenuitems.push({
      isBase64Icon: true,
      //@ts-ignore
      icon: 'vb',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      //title: `${isVBActive ? 'Hide' : 'Show'} Virtual Background`,
      title: virtualBackgroundLabel,
      callback: () => {
        setActionMenuVisible(false);
        toggleVB();
      },
    });
  }
  //virtual background

  //whiteboard start

  const {
    whiteboardRoomState,
    whiteboardActive,
    joinWhiteboardRoom,
    leaveWhiteboardRoom,
    getWhiteboardUid,
    whiteboardStartedFirst,
  } = useContext(whiteboardContext);

  const WhiteboardStoppedCallBack = () => {
    toggleWhiteboard(true, false);
  };

  const WhiteboardStartedCallBack = () => {
    toggleWhiteboard(false, false);
  };

  useEffect(() => {
    whiteboardActive && currentLayout !== 'pinned' && setLayout('pinned');
  }, []);

  const WhiteboardCallBack = ({status}) => {
    if (status) {
      WhiteboardStartedCallBack();
    } else {
      WhiteboardStoppedCallBack();
    }
  };

  useEffect(() => {
    LocalEventEmitter.on(
      LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
      WhiteboardCallBack,
    );
    return () => {
      LocalEventEmitter.off(
        LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
        WhiteboardCallBack,
      );
    };
  }, []);

  const toggleWhiteboard = (
    whiteboardActive: boolean,
    triggerEvent: boolean,
  ) => {
    if ($config.ENABLE_WHITEBOARD) {
      if (whiteboardActive) {
        leaveWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), false);
        setLayout('grid');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: false}),
            PersistanceLevel.Session,
          );
      } else {
        joinWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), WhiteboardWrapper, {}, true);
        dispatch({
          type: 'UserPin',
          value: [getWhiteboardUid()],
        });
        setLayout('pinned');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: true}),
            PersistanceLevel.Session,
          );
      }
    }
  };
  const WhiteboardDisabled =
    !isHost ||
    whiteboardRoomState === RoomPhase.Connecting ||
    whiteboardRoomState === RoomPhase.Disconnecting;

  //whiteboard ends

  if (isHost && $config.ENABLE_WHITEBOARD && isWebInternal()) {
    actionMenuitems.push({
      disabled: WhiteboardDisabled,
      isBase64Icon: true,
      //@ts-ignore
      icon: 'whiteboard-new',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: whiteboardLabel(whiteboardActive),
      callback: () => {
        setActionMenuVisible(false);
        toggleWhiteboard(whiteboardActive, true);
      },
    });
  }

  // host can see stt options and attendee can view only when stt is enabled by a host in the channel

  if ($config.ENABLE_STT) {
    actionMenuitems.push({
      icon: `${isCaptionON ? 'captions-off' : 'captions'}`,
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      disabled: !($config.ENABLE_STT && (isHost || (!isHost && isSTTActive))),
      title: captionLabel(isCaptionON),
      callback: () => {
        setActionMenuVisible(false);
        STT_clicked.current = !isCaptionON ? 'caption' : null;
        if (isSTTError) {
          setIsCaptionON(prev => !prev);
          return;
        }
        if (isSTTActive) {
          setIsCaptionON(prev => !prev);
          // is lang popup has been shown once for any user in meeting
        } else {
          isFirstTimePopupOpen.current = true;
          setLanguagePopup(true);
        }
      },
    });

    actionMenuitems.push({
      icon: 'transcript',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      disabled: !($config.ENABLE_STT && (isHost || (!isHost && isSTTActive))),
      title: transcriptLabel(isTranscriptON),
      callback: () => {
        setActionMenuVisible(false);
        STT_clicked.current = !isTranscriptON ? 'transcript' : null;
        if (isSTTError) {
          !isTranscriptON
            ? setSidePanel(SidePanelType.Transcript)
            : setSidePanel(SidePanelType.None);
          return;
        }
        if (isSTTActive) {
          !isTranscriptON
            ? setSidePanel(SidePanelType.Transcript)
            : setSidePanel(SidePanelType.None);
        } else {
          isFirstTimePopupOpen.current = true;
          setLanguagePopup(true);
        }
      },
    });
  }

  // view recordings

  if (isHost && $config.CLOUD_RECORDING && isWeb()) {
    actionMenuitems.push({
      icon: 'play-circle',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: viewRecordingsLabel,
      callback: () => {
        toggleVRModal();
      },
    });
  }

  if (globalWidth <= BREAKPOINTS.sm) {
    actionMenuitems.push({
      icon: 'participants',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: peopleLabel,
      callback: () => {
        setActionMenuVisible(false);
        setSidePanel(SidePanelType.Participants);
      },
    });
    actionMenuitems.push({
      icon: 'chat-nav',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: chatLabel,
      callback: () => {
        setActionMenuVisible(false);
        setChatType(ChatType.Group);
        setSidePanel(SidePanelType.Chat);
      },
    });

    if ($config.SCREEN_SHARING) {
      if (
        !(
          rtcProps.role == ClientRoleType.ClientRoleAudience &&
          $config.EVENT_MODE &&
          !$config.RAISE_HAND
        )
      ) {
        actionMenuitems.push({
          disabled:
            rtcProps.role == ClientRoleType.ClientRoleAudience &&
            $config.EVENT_MODE &&
            $config.RAISE_HAND &&
            !isHost,
          icon: isScreenshareActive ? 'stop-screen-share' : 'screen-share',
          iconColor: isScreenshareActive
            ? $config.SEMANTIC_ERROR
            : $config.SECONDARY_ACTION_COLOR,
          textColor: isScreenshareActive
            ? $config.SEMANTIC_ERROR
            : $config.FONT_COLOR,
          title: screenShareButton(isScreenshareActive),
          callback: () => {
            setActionMenuVisible(false);
            isScreenshareActive ? stopScreenshare() : startScreenshare();
          },
        });
      }
    }
    if (isHost && $config.CLOUD_RECORDING) {
      actionMenuitems.push({
        disabled: inProgress,
        icon: isRecordingActive ? 'stop-recording' : 'recording',
        iconColor: isRecordingActive
          ? $config.SEMANTIC_ERROR
          : $config.SECONDARY_ACTION_COLOR,
        textColor: isRecordingActive
          ? $config.SEMANTIC_ERROR
          : $config.FONT_COLOR,
        title: recordingButton(isRecordingActive),
        callback: () => {
          setActionMenuVisible(false);
          if (!isRecordingActive) {
            startRecording();
          } else {
            setShowStopRecordingPopup(true);
          }
        },
      });
    }
  }

  if (globalWidth <= BREAKPOINTS.md) {
    actionMenuitems.push({
      //below icon key is dummy value
      icon: 'grid',
      externalIconString: layouts[layout]?.icon,
      isExternalIcon: true,
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: layoutLabel,
      callback: () => {
        //setShowLayoutOption(true);
      },
      onHoverCallback: isHovered => {
        setShowLayoutOption(isHovered);
      },
      onHoverContent: (
        <LayoutIconDropdown
          onHoverPlaceHolder="vertical"
          setShowDropdown={() => {}}
          showDropdown={true}
          modalPosition={
            globalWidth <= BREAKPOINTS.sm
              ? {bottom: 65, left: -150}
              : {bottom: 20, left: -150}
          }
          caretPosition={{bottom: 45, right: -10}}
        />
      ),
    });
    actionMenuitems.push({
      icon: 'share',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: inviteLabel,
      callback: () => {
        setActionMenuVisible(false);
        setShowInvitePopup(true);
      },
    });
  }

  if (globalWidth <= BREAKPOINTS.sm) {
    actionMenuitems.push({
      icon: 'settings',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: settingsLabel,
      callback: () => {
        setActionMenuVisible(false);
        setSidePanel(SidePanelType.Settings);
      },
    });
  }

  useEffect(() => {
    if (isHovered) {
      setActionMenuVisible(true);
    } else setActionMenuVisible(false);
  }, [isHovered]);

  useEffect(() => {
    //hide action menu when user change layout
    setActionMenuVisible(false);
  }, [currentLayout]);

  const onConfirm = async (langChanged, language) => {
    const isCaptionClicked = STT_clicked.current === 'caption';
    const isTranscriptClicked = STT_clicked.current === 'transcript';
    setLanguagePopup(false);
    isFirstTimePopupOpen.current = false;
    const method = isCaptionClicked
      ? isCaptionON
      : isTranscriptON
      ? 'stop'
      : 'start';
    if (isTranscriptClicked) {
      if (!isTranscriptON) {
        setSidePanel(SidePanelType.Transcript);
      } else {
        setSidePanel(SidePanelType.None);
      }
    }
    if (method === 'stop') return; // not closing the stt service as it will stop for whole channel
    if (method === 'start' && isSTTActive === true) return; // not triggering the start service if STT Service already started by anyone else in the channel

    if (isCaptionClicked) {
      setIsCaptionON(prev => !prev);
    } else {
    }

    try {
      const res = await start(language);
      if (res?.message.includes('STARTED')) {
        // channel is already started now restart
        await restart(language);
      }
    } catch (error) {
      logger.error(LogSource.Internals, 'STT', 'error in starting stt', error);
    }
  };

  return (
    <>
      <LanguageSelectorPopup
        modalVisible={isLanguagePopupOpen}
        setModalVisible={setLanguagePopup}
        onConfirm={onConfirm}
        isFirstTimePopupOpen={isFirstTimePopupOpen.current}
      />
      {$config.CLOUD_RECORDING && isHost && isWeb() && isVRModalOpen && (
        <ViewRecordingsModal setModalOpen={setVRModalOpen} />
      )}
      <ActionMenu
        containerStyle={globalWidth < 720 ? {width: 180} : {width: 260}}
        hoverMode={true}
        onHover={isVisible => setIsHoveredOnModal(isVisible)}
        from={'control-bar'}
        actionMenuVisible={isHovered || isHoveredOnModal}
        setActionMenuVisible={setActionMenuVisible}
        modalPosition={{
          bottom: 8,
          left: 0,
        }}
        items={actionMenuitems}
      />
      <div
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}>
        {/** placeholder to hovering */}
        <View
          style={{
            position: 'absolute',
            top: -20,
            zIndex: -1,
            height: '50%',
            width: '100%',
            backgroundColor: 'transparent',
          }}
        />
        <IconButton
          setRef={ref => {
            moreBtnRef.current = ref;
          }}
          onPress={() => {
            //setActionMenuVisible(true);
          }}
          iconProps={{
            name: 'more-menu',
            tintColor: $config.SECONDARY_ACTION_COLOR,
          }}
          btnTextProps={{
            text: $config.ICON_TEXT ? moreButtonLabel : '',
            textColor: $config.FONT_COLOR,
          }}
        />
      </div>
    </>
  );
};
export const LayoutToolbarItem = () => (
  <ToolbarItem testID="layout-btn" collapsable={false}>
    {/**
     * .measure returns undefined on Android unless collapsable=false or onLayout are specified
     * so added collapsable property
     * https://github.com/facebook/react-native/issues/29712
     * */}
    <LayoutIconButton />
  </ToolbarItem>
);
export const InviteToolbarItem = () => {
  return (
    <ToolbarItem testID="invite-btn">
      <CopyJoinInfo />
    </ToolbarItem>
  );
};

export const RaiseHandToolbarItem = () => {
  const {rtcProps} = useContext(PropsContext);
  // attendee can view option if any host has started STT
  const {
    data: {isHost},
  } = useRoomInfo();
  return $config.EVENT_MODE ? (
    rtcProps.role == ClientRoleType.ClientRoleAudience ? (
      <LiveStreamControls showControls={true} />
    ) : rtcProps?.role == ClientRoleType.ClientRoleBroadcaster ? (
      /**
       * In event mode when raise hand feature is active
       * and audience is promoted to host, the audience can also
       * demote himself
       */
      <LiveStreamControls showControls={!isHost} />
    ) : (
      <></>
    )
  ) : (
    <></>
  );
};

export const LocalAudioToolbarItem = () => {
  return (
    <ToolbarItem testID="localAudio-btn">
      <LocalAudioMute showToolTip={true} />
    </ToolbarItem>
  );
};

export const LocalVideoToolbarItem = () => {
  return (
    !$config.AUDIO_ROOM && (
      <ToolbarItem testID="localVideo-btn">
        <LocalVideoMute showToolTip={true} />
      </ToolbarItem>
    )
  );
};

export const SwitchCameraToolbarItem = () => {
  return (
    !$config.AUDIO_ROOM &&
    isMobileOrTablet() && (
      <ToolbarItem testID="switchCamera-btn">
        <LocalSwitchCamera />
      </ToolbarItem>
    )
  );
};

export const ScreenShareToolbarItem = () => {
  const {width} = useWindowDimensions();
  return (
    width > BREAKPOINTS.sm &&
    $config.SCREEN_SHARING &&
    !isMobileOrTablet() && (
      <ToolbarItem testID="screenShare-btn">
        <ScreenshareButton />
      </ToolbarItem>
    )
  );
};
export const RecordingToolbarItem = () => {
  const {width} = useWindowDimensions();
  const {
    data: {isHost},
  } = useRoomInfo();
  return (
    width > BREAKPOINTS.sm &&
    isHost &&
    $config.CLOUD_RECORDING && (
      <ToolbarItem testID="recording-btn">
        <Recording />
      </ToolbarItem>
    )
  );
};

export const MoreButtonToolbarItem = () => {
  const {width} = useWindowDimensions();
  const {
    data: {isHost},
  } = useRoomInfo();
  const {isSTTActive} = useCaption();
  const [_, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    forceUpdate();
  }, [isHost]);

  return width < BREAKPOINTS.md ||
    ($config.ENABLE_STT && (isHost || (!isHost && isSTTActive))) ||
    $config.ENABLE_NOISE_CANCELLATION ||
    ($config.ENABLE_VIRTUAL_BACKGROUND && !$config.AUDIO_ROOM) ||
    (isHost && $config.ENABLE_WHITEBOARD && isWebInternal()) ? (
    <ToolbarItem testID="more-btn">
      {!isHost && $config.ENABLE_WHITEBOARD && isWebInternal() ? (
        <WhiteboardListener />
      ) : (
        <></>
      )}
      <MoreButton />
    </ToolbarItem>
  ) : (
    <WhiteboardListener />
  );
};
export interface LocalEndcallToolbarItemProps {
  customExit?: () => void;
}
export const LocalEndcallToolbarItem = (
  props?: LocalEndcallToolbarItemProps,
) => {
  return (
    <ToolbarItem
      testID={props?.customExit ? 'endCall-btn-custom' : 'endCall-btn'}>
      <LocalEndcall {...props} />
    </ToolbarItem>
  );
};

const defaultItems: ToolbarDefaultItem[] = [
  {
    align: 'start',
    component: LayoutToolbarItem,
    componentName: 'layout',
    order: 0,
    hide: 'no',
  },
  {
    align: 'start',
    component: InviteToolbarItem,
    componentName: 'invite',
    order: 1,
    hide: 'no',
  },
  {
    align: 'center',
    component: RaiseHandToolbarItem,
    componentName: 'raise-hand',
    order: 0,
    hide: 'no',
  },
  {
    align: 'center',
    component: LocalAudioToolbarItem,
    componentName: 'local-audio',
    order: 1,
    hide: 'no',
  },
  {
    align: 'center',
    component: LocalVideoToolbarItem,
    componentName: 'local-video',
    order: 2,
    hide: 'no',
  },
  {
    align: 'center',
    component: SwitchCameraToolbarItem,
    componentName: 'switch-camera',
    order: 3,
    hide: 'no',
  },
  {
    align: 'center',
    component: ScreenShareToolbarItem,
    componentName: 'screenshare',
    order: 4,
    hide: 'no',
  },
  {
    align: 'center',
    component: RecordingToolbarItem,
    componentName: 'recording',
    order: 5,
    hide: 'no',
  },
  {
    align: 'center',
    component: MoreButtonToolbarItem,
    componentName: 'more',
    order: 6,
    hide: 'no',
  },
  {
    align: 'center',
    componentName: 'end-call',
    component: LocalEndcallToolbarItem,
    order: 7,
    hide: 'no',
  },
];

export interface ControlsProps {
  customItems?: ToolbarCustomItem[];
  includeDefaultItems?: boolean;
  defaultItemsConfig?: ToolbarDefaultItemConfig;
}
const Controls = (props: ControlsProps) => {
  const {
    customItems = [],
    includeDefaultItems = true,
    defaultItemsConfig = {},
  } = props;
  const {width} = useWindowDimensions();
  const {defaultContent} = useContent();
  const {setLanguage, setMeetingTranscript, setIsSTTActive} = useCaption();
  const defaultContentRef = React.useRef(defaultContent);
  const {setRoomInfo} = useSetRoomInfo();
  const heading = useString<'Set' | 'Changed'>(sttSpokenLanguageToastHeading);
  const subheading = useString<{
    action: 'Set' | 'Changed';
    newLanguage: string;
    oldLanguage: string;
    username: string;
  }>(sttSpokenLanguageToastSubHeading);

  const {
    data: {isHost},
    sttLanguage,
    isSTTActive,
  } = useRoomInfo();

  React.useEffect(() => {
    defaultContentRef.current = defaultContent;
  }, [defaultContent]);

  React.useEffect(() => {
    // for mobile events are set in ActionSheetContent
    if (!sttLanguage) return;
    const {
      username,
      prevLang,
      newLang,
      uid,
      langChanged,
    }: RoomInfoContextInterface['sttLanguage'] = sttLanguage;
    if (!langChanged) return;
    const actionText =
      prevLang.indexOf('') !== -1
        ? `has set the spoken language to  "${getLanguageLabel(newLang)}" `
        : `changed the spoken language from "${getLanguageLabel(
            prevLang,
          )}" to "${getLanguageLabel(newLang)}" `;
    // const msg = `${
    //   //@ts-ignore
    //   defaultContentRef.current[uid]?.name || username
    // } ${actionText} `;
    let subheadingObj: any = {};
    if (prevLang.indexOf('') !== -1) {
      subheadingObj = {
        username: defaultContentRef.current[uid]?.name || username,
        action: prevLang.indexOf('') !== -1 ? 'Set' : 'Changed',
        newLanguage: getLanguageLabel(newLang),
      };
    } else {
      subheadingObj = {
        username: defaultContentRef.current[uid]?.name || username,
        action: prevLang.indexOf('') !== -1 ? 'Set' : 'Changed',
        newLanguage: getLanguageLabel(newLang),
        oldLanguage: getLanguageLabel(prevLang),
      };
    }

    Toast.show({
      leadingIconName: 'lang-select',
      type: 'info',
      text1: heading(prevLang.indexOf('') !== -1 ? 'Set' : 'Changed'),
      visibilityTime: 3000,
      primaryBtn: null,
      secondaryBtn: null,
      text2: subheading(subheadingObj),
    });
    setRoomInfo(prev => {
      return {
        ...prev,
        sttLanguage: {...sttLanguage, langChanged: false},
      };
    });
    // syncing local set language
    newLang && setLanguage(newLang);
    // add spoken lang msg to transcript
    setMeetingTranscript(prev => {
      return [
        ...prev,
        {
          name: 'langUpdate',
          time: new Date().getTime(),
          uid: `langUpdate-${uid}`,
          text: actionText,
        },
      ];
    });
  }, [sttLanguage]);

  React.useEffect(() => {
    setIsSTTActive(isSTTActive);
  }, [isSTTActive]);

  const ToastIcon = ({color}) => (
    <View style={{marginRight: 12, alignSelf: 'center', width: 24, height: 24}}>
      <ImageIcon iconType="plain" tintColor={color} name={'lang-select'} />
    </View>
  );

  const isHidden = i => {
    return i?.hide === 'yes';
  };
  const customStartItems = customItems
    ?.concat(
      includeDefaultItems
        ? updateToolbarDefaultConfig(defaultItems, defaultItemsConfig)
        : [],
    )
    ?.filter(i => i?.align === 'start' && !isHidden(i))
    ?.sort(CustomToolbarSort);

  const customCenterItems = customItems
    ?.concat(
      includeDefaultItems
        ? updateToolbarDefaultConfig(defaultItems, defaultItemsConfig)
        : [],
    )
    ?.filter(i => i?.align === 'center' && !isHidden(i))
    ?.sort(CustomToolbarSort);

  const customEndItems = customItems
    ?.concat(
      includeDefaultItems
        ? updateToolbarDefaultConfig(defaultItems, defaultItemsConfig)
        : [],
    )
    ?.filter(i => i?.align === 'end' && !isHidden(i))
    ?.sort(CustomToolbarSort);

  const renderContent = (
    items: ToolbarCustomItem[],
    type: 'start' | 'center' | 'end',
  ) => {
    return items?.map((item, index) => {
      const ToolbarItem = item?.component;
      if (ToolbarItem) {
        return <ToolbarItem key={`bottom-toolbar-${type}` + index} />;
      } else {
        return null;
      }
    });
  };
  return (
    <Toolbar>
      {width >= BREAKPOINTS.md && (
        <View style={[style.startContent]}>
          {renderContent(customStartItems, 'start')}
        </View>
      )}
      <View style={[style.centerContent]}>
        {renderContent(customCenterItems, 'center')}
      </View>
      {width >= BREAKPOINTS.md && (
        <View style={style.endContent}>
          {renderContent(customEndItems, 'end')}
        </View>
      )}
    </Toolbar>
  );
};

const style = StyleSheet.create({
  startContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  centerContent: {
    zIndex: 2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  secondaryBtn: {marginLeft: 16, height: 40, paddingVertical: 5},
  primaryBtn: {
    maxWidth: 109,
    minWidth: 109,
    height: 40,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    fontWeight: '600',
    fontSize: 16,
    paddingLeft: 0,
  },
});

export default Controls;
