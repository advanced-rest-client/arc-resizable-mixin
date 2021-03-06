import { dedupeMixin } from '@open-wc/dedupe-mixin';

// Contains all connected resizables that do not have a parent.
const ORPHANS = new Set();

/* eslint-disable class-methods-use-this */
/* eslint-disable no-unused-vars */

export const resizeNotificationEventType = 'requestresizenotifications';
export const resizeEventType = 'resize';
export const legacyResizeEventType = 'iron-resize';

/**
 * @param {typeof HTMLElement} base
 */
const mxFunction = base => {
  class ArcResizableMixinImpl extends base {
    /**
     * The closest ancestor element that implements `ArcResizableMixin`.
     * @return {HTMLElement}
     */
    get _parentResizable() {
      return this.__parentResizable;
    }

    /**
     * @param {HTMLElement} value
     */
    set _parentResizable(value) {
      const old = this.__parentResizable;
      this.__parentResizable = value;
      if (old !== value) {
        this._parentResizableChanged(value);
      }
    }

    get _notifyingDescendant() {
      return this.__notifyingDescendant;
    }

    set _notifyingDescendant(value) {
      this.__notifyingDescendant = value;
    }

    constructor() {
      super();
      this._interestedResizables = [];
      this._notifyingDescendant = false;
      this._onIronRequestResizeNotifications = this._onIronRequestResizeNotifications.bind(this);
      this.notifyResize = this.notifyResize.bind(this);
      this._onDescendantIronResize = this._onDescendantIronResize.bind(this);
      this.addEventListener(resizeNotificationEventType, this._onIronRequestResizeNotifications, true);
    }

    connectedCallback() {
      // @ts-ignore
      if (super.connectedCallback) {
        // @ts-ignore
        super.connectedCallback();
      }
      this.isAttached = true;
      setTimeout(() => {
        this._requestResizeNotifications();
      });
    }

    disconnectedCallback() {
      // @ts-ignore
      if (super.disconnectedCallback) {
        // @ts-ignore
        super.disconnectedCallback();
      }
      this.isAttached = false;
      // this.removeEventListener(resizeNotificationEventType, this._onIronRequestResizeNotifications);
      if (this._parentResizable) {
        // @ts-ignore
        this._parentResizable.stopResizeNotificationsFor(this);
      } else {
        ORPHANS.delete(this);
        window.removeEventListener('resize', this.notifyResize);
      }

      this._parentResizable = null;
    }

    /**
     * Can be called to manually notify a resizable and its descendant
     * resizables of a resize change.
     */
    notifyResize() {
      if (!this.isAttached) {
        return;
      }
      this._interestedResizables.forEach((resizable) => {
        if (this.resizerShouldNotify(resizable)) {
          this._notifyDescendant(resizable);
        }
      });
      this._fireResize();
    }

    /**
     * Used to assign the closest resizable ancestor to this resizable
     * if the ancestor detects a request for notifications.
     *
     * @param {HTMLElement} parentResizable
     */
    assignParentResizable(parentResizable) {
      if (this._parentResizable) {
        // @ts-ignore
        this._parentResizable.stopResizeNotificationsFor(this);
      }

      this._parentResizable = parentResizable;
      // @ts-ignore
      if (parentResizable && parentResizable._interestedResizables.indexOf(this) === -1) {
        // @ts-ignore
        parentResizable._interestedResizables.push(this);
        // @ts-ignore
        parentResizable._subscribeIronResize(this);
      }
    }

    /**
     * Used to remove a resizable descendant from the list of descendants
     * that should be notified of a resize change.
     *
     * @param {HTMLElement} target
     */
    stopResizeNotificationsFor(target) {
      const index = this._interestedResizables.indexOf(target);
      if (index > -1) {
        this._interestedResizables.splice(index, 1);
        this._unsubscribeIronResize(target);
      }
    }

    /**
     * Subscribe this element to listen to `resize` events on the given target.
     *
     * Preferred over target.listen because the property "renamer" does not
     * understand to rename when the target is not specifically "this"
     *
     * @param {HTMLElement} target Element to listen to for `resize` events.
     */
    _subscribeIronResize(target) {
      target.addEventListener(legacyResizeEventType, this._onDescendantIronResize);
      target.addEventListener(resizeEventType, this._onDescendantIronResize);
    }

    /**
     * Unsubscribe this element from listening to to `resize` events on the
     * given target.
     *
     * Preferred over target.unlisten because the property "renamer" does not
     * understand to rename when the target is not specifically "this"
     *
     * @param {HTMLElement} target Element to listen to for `resize` events.
     */
    _unsubscribeIronResize(target) {
      target.removeEventListener(legacyResizeEventType, this._onDescendantIronResize);
      target.removeEventListener(resizeEventType, this._onDescendantIronResize);
    }

    /**
     * This method can be overridden to filter nested elements that should or
     * should not be notified by the current element. Return true if an element
     * should be notified, or false if it should not be notified.
     *
     * @param {HTMLElement} element A candidate descendant element that
     * implements `ArcResizableMixin`.
     * @return {boolean} True if the `element` should be notified of resize.
     */
    resizerShouldNotify(element) {
      return true;
    }

    _onDescendantIronResize(e) {
      if (this._notifyingDescendant) {
        e.stopPropagation();
        return;
      }
      this._fireResize();
    }

    _fireResize() {
      this.dispatchEvent(new CustomEvent(resizeEventType));
    }

    _onIronRequestResizeNotifications(e) {
      const cp = e.composedPath && e.composedPath();
      let path;
      if (cp) {
        path = cp;
      } else {
        path = e.path || [];
      }
      const target = path[0];
      if (target === this) {
        return;
      }
      if(target.assignParentResizable) {
        target.assignParentResizable(this);
      }
      this._notifyDescendant(target);
      e.stopPropagation();
    }

    _parentResizableChanged(parentResizable) {
      if (parentResizable) {
        window.removeEventListener('resize', this.notifyResize);
      }
    }

    _notifyDescendant(descendant) {
      // NOTE(cdata): In IE10, attached is fired on children first, so it's
      // important not to notify them if the parent is not attached yet (or
      // else they will get redundantly notified when the parent attaches).
      if (!this.isAttached) {
        return;
      }

      this._notifyingDescendant = true;
      descendant.notifyResize();
      this._notifyingDescendant = false;
    }

    _requestResizeNotifications() {
      if (!this.isAttached) {
        return;
      }

      if (document.readyState === 'loading') {
        const _requestResizeNotifications = this._requestResizeNotifications.bind(this);
        document.addEventListener(
            'readystatechange', function readystatechanged() {
              document.removeEventListener('readystatechange', readystatechanged);
              _requestResizeNotifications();
            });
      } else {
        this._findParent();

        if (!this._parentResizable) {
          // If this resizable is an orphan, tell other orphans to try to find
          // their parent again, in case it's this resizable.
          ORPHANS.forEach((orphan) => {
            if (orphan !== this) {
              orphan._findParent();
            }
          });

          window.addEventListener('resize', this.notifyResize);
          this.notifyResize();
        } else {
          // If this resizable has a parent, tell other child resizables of
          // that parent to try finding their parent again, in case it's this
          // resizable.
          // @ts-ignore
          this._parentResizable._interestedResizables
              .forEach((resizable) => {
                if (resizable !== this) {
                  resizable._findParent();
                }
              });
        }
      }
    }

    _findParent() {
      this.assignParentResizable(null);
      this.dispatchEvent(new CustomEvent(resizeNotificationEventType, {
        bubbles: true,
        cancelable: true,
        composed: true
      }));

      if (!this._parentResizable) {
        ORPHANS.add(this);
      } else {
        ORPHANS.delete(this);
      }
    }
  }
  return ArcResizableMixinImpl;
}

/**
 * This mixin is a port of [IronResizableBehavior]https://github.com/PolymerElements/iron-resizable-behavior
 * that works with LitElement.
 *
 * `ArcResizableMixin` is a behavior that can be used in web components to
 * coordinate the flow of resize events between "resizers" (elements that
 * control the size or hidden state of their children) and "resizables" (elements
 * that need to be notified when they are resized or un-hidden by their parents
 * in order to take action on their new measurements).
 *
 * Elements that perform measurement should add the `ArcResizableMixin` mixin to their element definition and listen for the `resize` event on themselves. 
 * This event will be fired when they become showing after having been hidden, when they are resized explicitly by another resizable, or when the window has been resized.
 *
 * Note, the `resize` event is non-bubbling.
 *
 * ## Usage
 *
 * ```javascript
 * import { LitElement } from 'lit-element';
 * import { ArcResizableMixin } from '@advanced-rest-client/arc-resizable-mixin.js';
 *
 * class ArcResizableImpl extends ArcResizableMixin(LitElement) {
 *  ...
 * }
 * ```
 *
 * @mixin
 */
export const ArcResizableMixin = dedupeMixin(mxFunction);
