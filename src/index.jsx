import 'babel-polyfill';
import React from 'react';
import ReactDOM from 'react-dom';
import { identifyAuthenticatedUser, sendPageEvent, configureAnalytics, initializeSegment } from '@edx/frontend-analytics';
import { configureLoggingService, NewRelicLoggingService } from '@edx/frontend-logging';
import { getAuthenticatedAPIClient } from '@edx/frontend-auth';
import { configure as configureI18n } from '@edx/frontend-i18n';

import { configuration } from './environment';
import configureStore from './store';
import { configureProfileApiService } from './profile';
import { configureUserAccountApiService } from './common';
import messages from './i18n';

import './index.scss';
import App from './components/App';

const apiClient = getAuthenticatedAPIClient({
  appBaseUrl: configuration.BASE_URL,
  authBaseUrl: configuration.LMS_BASE_URL,
  loginUrl: configuration.LOGIN_URL,
  logoutUrl: configuration.LOGOUT_URL,
  csrfTokenApiPath: configuration.CSRF_TOKEN_API_PATH,
  refreshAccessTokenEndpoint: configuration.REFRESH_ACCESS_TOKEN_ENDPOINT,
  accessTokenCookieName: configuration.ACCESS_TOKEN_COOKIE_NAME,
  userInfoCookieName: configuration.USER_INFO_COOKIE_NAME,
  csrfCookieName: configuration.CSRF_COOKIE_NAME,
  loggingService: NewRelicLoggingService,
});

/**
 * We need to merge the application configuration with the authentication state
 * so that we can hand it all to the redux store's initializer.
 */
function createInitialState() {
  return Object.assign({}, { configuration }, apiClient.getAuthenticationState());
}

function configure() {
  configureI18n(configuration, messages);

  const { store, history } = configureStore(createInitialState(), configuration.ENVIRONMENT);

  configureLoggingService(NewRelicLoggingService);
  configureProfileApiService(configuration, apiClient);
  configureUserAccountApiService(configuration, apiClient);
  initializeSegment(configuration.SEGMENT_KEY);
  configureAnalytics({
    loggingService: NewRelicLoggingService,
    authApiClient: apiClient,
    analyticsApiBaseUrl: configuration.LMS_BASE_URL,
  });

  return {
    store,
    history,
  };
}

/*
  ARCH-904
  Attempts to protect against browser extension manipulation of the DOM which
  causes React to break. See the following link:
  https://github.com/facebook/react/issues/11538#issuecomment-417504600
*/
function monkeyPatchDOMManipulation() {
  if (typeof Node === 'function' && Node.prototype) {
    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (newNode, referenceNode, ...args) {
      if (referenceNode && referenceNode.parentNode !== this) {
        NewRelicLoggingService.logError(`Cannot insert before a reference node from a different parent: ${referenceNode} ${this}`);
        return newNode;
      }
      return originalInsertBefore.apply(this, [newNode, referenceNode, ...args]);
    };
  }
}

apiClient.ensurePublicOrAuthenticationAndCookies(
  window.location.pathname,
  () => {
    const { store, history } = configure();
    monkeyPatchDOMManipulation();

    ReactDOM.render(<App store={store} history={history} />, document.getElementById('root'));

    identifyAuthenticatedUser();
    sendPageEvent();
  },
);

