import { html, css, LitElement } from "lit";
import { state, property, query } from "lit/decorators.js";

import { contextProvided } from "@lit-labs/context";
import { StoreSubscriber } from "lit-svelte-stores";
import { Unsubscriber } from "svelte/store";

import { sharedStyles } from "../sharedStyles";
import {howContext, Alignment, Dictionary, Signal} from "../types";
import { HowStore } from "../how.store";
import { HowAlignment } from "./how-alignment";
import { HowAlignmentDialog } from "./how-alignment-dialog";
import { SlAvatar } from '@scoped-elements/shoelace';
import { ScopedElementsMixin } from "@open-wc/scoped-elements";
import {
  ListItem,
  Select,
  IconButton,
  Button, TextField, TopAppBar, Drawer, List, Icon, Switch, Formfield, Menu,
} from "@scoped-elements/material-web";
import {
  profilesStoreContext,
  ProfilesStore,
  Profile,
} from "@holochain-open-dev/profiles";
import {EntryHashB64} from "@holochain-open-dev/core-types";

/**
 * @element how-controller
 */
export class HowController extends ScopedElementsMixin(LitElement) {
  constructor() {
    super();
  }

  /** Public attributes */
  @property({ type: Boolean, attribute: 'dummy' })
  canLoadDummy = false;

  /** Dependencies */

  @contextProvided({ context: howContext })
  _store!: HowStore;

  @contextProvided({ context: profilesStoreContext })
  _profiles!: ProfilesStore;

  _myProfile = new StoreSubscriber(this, () => this._profiles.myProfile);
  _knownProfiles = new StoreSubscriber(this, () => this._profiles.knownProfiles);
  _alignments = new StoreSubscriber(this, () => this._store.alignments);

  /** Private properties */

  @query('#my-drawer')
  private _drawer!: Drawer;

  @state() _currentAlignmentEh = "";
  @state() _currentTemplateEh = "";

  private initialized = false;
  private initializing = false;


  async createDummyProfile() {
    const nickname = "Cam";
    const avatar = "https://cdn3.iconfinder.com/data/icons/avatars-9/145/Avatar_Cat-512.png";

    try {
      const fields: Dictionary<string> = {};
       if (avatar) {
         fields['avatar'] = avatar;
       }
      await this._profiles.createProfile({
        nickname,
        fields,
      });

    } catch (e) {
      //this._existingUsernames[nickname] = true;
      //this._nicknameField.reportValidity();
    }
  }


  get myNickName(): string {
    return this._myProfile.value.nickname;
  }
  get myAvatar(): string {
    return this._myProfile.value.fields.avatar;
  }

  private subscribeProfile() {
    let unsubscribe: Unsubscriber;
    unsubscribe = this._profiles.myProfile.subscribe(async (profile) => {
      if (profile) {
        await this.checkInit();
      }
      // unsubscribe()
    });
  }

  async firstUpdated() {
    if (this.canLoadDummy) {
      await this.createDummyProfile()
    }
    this.subscribeProfile()
  }
 
  private _getFirst(alignments: Dictionary<Alignment>): EntryHashB64 {
    if (Object.keys(alignments).length == 0) {
      return "";
    }
    for (let alignmentEh in alignments) {
//      const alignment = alignments[alignmentEh]
//      if (alignment.visible) {
        return alignmentEh
//      }
    }
    return "";
  }

  async checkInit() {
    if (this.initialized || this.initializing) {
      this.initialized = true;
      return;
    }
    this.initializing = true  // because checkInit gets call whenever profiles changes...
    let alignments = await this._store.pullAlignments();

    /** load up a alignment if there are none */
    if (Object.keys(alignments).length == 0) {
      console.log("no alignments found, initializing")
      await this.addHardcodedAlignments();
      alignments = await this._store.pullAlignments();
    }
    if (Object.keys(alignments).length == 0) {
      console.error("No alignments found")
    }
    this._currentAlignmentEh = this._getFirst(alignments);

    console.log("   current alignment: ",  alignments[this._currentAlignmentEh].name, this._currentAlignmentEh);

    // request the update so the drawer will be findable
    await this.requestUpdate();

    /** Drawer */
    if (this._drawer) {
      const container = this._drawer.parentNode!;
      container.addEventListener('MDCTopAppBar:nav', () => {
        this._drawer.open = !this._drawer.open;
      });
    }
    /** Menu */
    const menu = this.shadowRoot!.getElementById("top-menu") as Menu;
    const button = this.shadowRoot!.getElementById("menu-button") as IconButton;
    menu.anchor = button
    // - Done
    this.initializing = false
    this.initialized = true
  }

  async addHardcodedAlignments() {
 
    /** Alignments */
    await this._store.addAlignment({
      name: "Funky",
      meta: {
        foo: `bar`,
      },
    });
  }

  async refresh() {
    console.log("refresh: Pulling data from DHT")
    await this._store.pullAlignments();
    await this._profiles.fetchAllProfiles()
  }

  get alignmentElem(): HowAlignment {
    return this.shadowRoot!.getElementById("how-alignment") as HowAlignment;
  }

  async openAlignmentDialog(alignment?: any) {
    this.alignmentDialogElem.resetAllFields();
    this.alignmentDialogElem.open(alignment);
  }

  get alignmentDialogElem() : HowAlignmentDialog {
    return this.shadowRoot!.getElementById("alignment-dialog") as HowAlignmentDialog;
  }

  private async handleAlignmentSelected(e: any): Promise<void> {
    const index = e.detail.index;
    const alignmentList = this.shadowRoot!.getElementById("alignments-list") as List;
    const value = alignmentList.items[index].value;
    console.log("alignment value: " + value);
    this.handleAlignmentSelect(value);
  }

  private async handleAlignmentSelect(alignmentEh: string): Promise<void> {
    this._currentAlignmentEh = alignmentEh;
    this.alignmentElem.currentAlignmentEh = alignmentEh;
  }

  openTopMenu() {
    const menu = this.shadowRoot!.getElementById("top-menu") as Menu;
    menu.open = true;
  }

  handleMenuSelect(e: any) {
    console.log("handleMenuSelect: " + e.originalTarget.innerHTML)
    //console.log({e})
    switch (e.originalTarget.innerHTML) {
      case "Duplicate Alignment":
        this.openAlignmentDialog(this._currentAlignmentEh)
        break;
      default:
        break;
    }
  }

  render() {
    if (!this._currentAlignmentEh) {
      return;
    }

    /** Build agent list */
    const folks = Object.entries(this._knownProfiles.value).map(([key, profile])=>{
      return html`
        <li class="folk">
          <sl-avatar .image=${profile.fields.avatar}></sl-avatar>
          <div>${profile.nickname}</div>
        </li>`
    })

    /** Build alignment list */
    const alignments = Object.entries(this._alignments.value).map(
      ([key, alignment]) => {
        return html`
          <mwc-list-item class="alignment-li" .selected=${key == this._currentAlignmentEh} value="${key}">
            <span>${alignment.name}</span>
          </mwc-list-item>
          `
      }
    )


    return html`
<!--  DRAWER -->
<mwc-drawer type="dismissible" id="my-drawer">
  <div>
    <mwc-list>
    <mwc-list-item twoline graphic="avatar" noninteractive>
      <span>${this.myNickName}</span>
      <span slot="secondary">${this._profiles.myAgentPubKey}</span>
      <sl-avatar style="margin-left:-22px;" slot="graphic" .image=${this.myAvatar}></sl-avatar>
    </mwc-list-item>
    <li divider role="separator"></li>
    </mwc-list>
    <mwc-button icon="add_circle" @click=${() => this.openAlignmentDialog()}>Alignment</mwc-button>

    <!-- Alignment List -->
    <mwc-list id="alignments-list" activatable @selected=${this.handleAlignmentSelected}>
      ${alignments}
    </mwc-list>

  </div>
<!-- END DRAWER -->

  <div slot="appContent">
    <!-- TOP APP BAR -->
    <mwc-top-app-bar id="app-bar" dense style="position: relative;">
      <mwc-icon-button icon="menu" slot="navigationIcon"></mwc-icon-button>
      <div slot="title">How - ${this._alignments.value[this._currentAlignmentEh].name}</div>
      <mwc-icon-button slot="actionItems" icon="autorenew" @click=${() => this.refresh()} ></mwc-icon-button>
      <mwc-icon-button id="menu-button" slot="actionItems" icon="more_vert" @click=${() => this.openTopMenu()}></mwc-icon-button>
      <mwc-menu id="top-menu" @click=${this.handleMenuSelect}>
        <mwc-list-item graphic="icon" value="fork_alignment"><span>Duplicate Alignment</span><mwc-icon slot="graphic">edit</mwc-icon></mwc-list-item>
      </mwc-menu>
    </mwc-top-app-bar>

    <div class="appBody">
      <how-alignment id="how-alignment" .currentAlignmentEh=${this._currentAlignmentEh}></how-alignment>
      <div class="folks">
        ${folks}
      </div>
    </div>

    <how-alignment-dialog id="alignment-dialog"
                        .myProfile=${this._myProfile.value}
                        @alignment-added=${(e:any) => this._currentAlignmentEh = e.detail}>
    </how-alignment-dialog>
  </div>
</mwc-drawer>
`;
  }


  static get scopedElements() {
    return {
      "mwc-menu": Menu,
      "mwc-switch": Switch,
      "mwc-drawer": Drawer,
      "mwc-top-app-bar": TopAppBar,
      "mwc-textfield": TextField,
      "mwc-select": Select,
      "mwc-list": List,
      "mwc-list-item": ListItem,
      "mwc-icon": Icon,
      "mwc-icon-button": IconButton,
      "mwc-button": Button,
      "how-alignment-dialog" : HowAlignmentDialog,
      "how-alignment": HowAlignment,
      "mwc-formfield": Formfield,
      'sl-avatar': SlAvatar,
    };
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        :host {
          margin: 10px;
        }

        .mdc-drawer__header {
          display:none;
        }

        mwc-top-app-bar {
          /**--mdc-theme-primary: #00ffbb;*/
          /**--mdc-theme-on-primary: black;*/
        }

        #app-bar {
          /*margin-top: -15px;*/
        }

        #my-drawer {
          margin-top: -15px;
        }

        .appBody {
          width: 100%;
          margin-top: 2px;
          display:flex;
        }

        .folk {
          list-style: none;
          margin: 2px;
          text-align: center;
          font-size: 70%;
        }

        .folk > img {
          width: 50px;
          border-radius: 10000px;
        }

        mwc-textfield.rounded {
          --mdc-shape-small: 20px;
          width: 7em;
          margin-top:10px;
        }

        mwc-textfield label {
          padding: 0px;
        }

        @media (min-width: 640px) {
          main {
            max-width: none;
          }
        }
      `,
    ];
  }
}