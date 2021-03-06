'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Commands} from '../types/Commands';
import type {Gadget} from '../types/Gadget';

import invariant from 'assert';
import {CompositeDisposable, Disposable} from 'atom';
import createCommands from './createCommands';
import createComponentItem from './createComponentItem';
import createStateStream from './createStateStream';
import GadgetPlaceholder from './GadgetPlaceholder';
import getInitialState from './getInitialState';
import observableFromSubscribeFunction from './observableFromSubscribeFunction';
import React from 'react-for-atom';
import Rx from 'rx';
import syncAtomCommands from './syncAtomCommands';

class Activation {
  _disposables: CompositeDisposable;
  commands: Commands;

  constructor(initialState: ?Object) {
    initialState = getInitialState();
    const action$ = new Rx.Subject();
    const state$ = createStateStream(action$, initialState);
    const commands = this.commands = createCommands(action$, () => state$.getValue());

    const getGadgets = state => state.get('gadgets');
    const gadget$ = state$.map(getGadgets).distinctUntilChanged();

    this._disposables = new CompositeDisposable(
      action$,

      // Handle all gadget URLs
      atom.workspace.addOpener(uri => commands.openUri(uri)),

      // Re-render all pane items when (1) new items are added, (2) new gadgets are registered and
      // (3) the active pane item changes.
      observableFromSubscribeFunction(atom.workspace.observePaneItems.bind(atom.workspace))
        .merge(
          observableFromSubscribeFunction(
            atom.workspace.onDidChangeActivePaneItem.bind(atom.workspace)
          )
        )
        .merge(gadget$)
        .throttle(100)
        .forEach(() => this.commands.renderPaneItems()),

      // Clean up when pane items are destroyed.
      observableFromSubscribeFunction(atom.workspace.onDidDestroyPaneItem.bind(atom.workspace))
        .forEach(({item}) => this.commands.destroyPaneItem(item)),

      // Keep the atom commands up to date with the registered gadgets.
      syncAtomCommands(gadget$, commands),
    );
  }

  dispose() {
    this.commands.deactivate();
    this._disposables.dispose();
  }
}

let activation: ?Activation = null;

export function activate(state: ?Object) {
  if (activation != null) {
    return;
  }
  activation = new Activation(state);
}

export function deactivate() {
  if (activation == null) {
    return;
  }
  activation.dispose();
  activation = null;
}

export function consumeGadget(gadget: Gadget): atom$Disposable {
  invariant(activation);
  activation.commands.registerGadget(gadget);
  return new Disposable(() => {
    if (activation == null) {
      return;
    }
    activation.commands.unregisterGadget(gadget.gadgetId);
  });
}

atom.deserializers.add({
  name: 'GadgetPlaceholder',
  deserialize(state) {
    // Pane items are deserialized before the gadget providers have had a chance to register their
    // gadgets. Therefore, we need to create a placeholder item that we later replace.
    return createComponentItem(<GadgetPlaceholder {...state.data} />);
  },
});
