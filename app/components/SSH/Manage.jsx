import React from 'react'
import PropTypes from 'prop-types';
import _ from 'lodash';
import { Tabs, Tab } from 'material-ui/Tabs';
import { Toolbar, ToolbarGroup } from 'material-ui/Toolbar';
import Paper from 'material-ui/Paper';
import styles from './ssh.css';
import sharedStyles from '../shared/styles.css';
import FlatButton from 'material-ui/FlatButton';
import { green500, green400, red500, red300, white } from 'material-ui/styles/colors.js'
import { List, ListItem } from 'material-ui/List';
import Dialog from 'material-ui/Dialog';
import TextField from 'material-ui/TextField';
import IconButton from 'material-ui/IconButton';
import JsonEditor from '../shared/JsonEditor.jsx';
import ghcl from 'gopher-hcl';
import jsonschema from './vault-ssh-schema.json'
import { callVaultApi, tokenHasCapabilities, history } from '../shared/VaultUtils.jsx'
import Avatar from 'material-ui/Avatar';
import HardwareSecurity from 'material-ui/svg-icons/hardware/security';
import ActionDeleteForever from 'material-ui/svg-icons/action/delete-forever';
import ActionDelete from 'material-ui/svg-icons/action/delete';
import update from 'immutability-helper';

import ItemList from '../shared/ItemList/ItemList.jsx';

function snackBarMessage(message) {
    let ev = new CustomEvent("snackbar", { detail: { message: message } });
    document.dispatchEvent(ev);
}

export default class SSHManager extends React.Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
    };

    constructor(props) {
        super(props);

        this.baseUrl = `/ssh/`;
        this.baseVaultPath = `/ssh`;

        this.state = {
            openEditModal: false,
            openNewSSHEngineModal: false,
            newSSHEngineErrorMessage: '',
            newSSHEngineNameErrorMessage: '',
            openDeleteModal: false,
            focusPolicy: -1,
            deletingPolicy: '',
            sshEngines: [],
            currentSSHEngine: '',
            disableSubmit: false,
            forbidden: false,
            buttonColor: 'lightgrey'
        };

        _.bindAll(
            this,
            'createSSHEngine',
            'updateSSHEngine',
            'displaySSHEngine',
            'listSSHEngines',
            'sshEngineChangeSetState',
            'renderEditDialog',
            'renderNewSSHEngineDialog'
        )
    }

    componentDidMount() {
        if (this.props.params.splat) {
            this.displaySSHEngine();
        } else {
            this.listSSHEngines();
        }
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(this.props.params, prevProps.params)) {
            if (this.props.params.splat) {
                this.displaySSHEngine();
            } else {
                this.listSSHEngines();
            }
        }
    }

    sshEngineChangeSetState(v, syntaxCheckOk, schemaCheckOk) {
        if (syntaxCheckOk && schemaCheckOk && v) {
            this.setState({ disableSubmit: false, currentSSHEngine: v });
        } else {
            this.setState({ disableSubmit: true });
        }
    }

    renderEditDialog() {
        const actions = [
            <FlatButton
                label="Cancel"
                primary={true}
                onTouchTap={() => {
                    this.setState({ openEditModal: false })
                    history.push(this.baseUrl);
                }}
            />,
            <FlatButton
                label="Submit"
                disabled={this.state.disableSubmit}
                primary={true}
                onTouchTap={() => {
                    this.updateSSHEngine(this.state.focusPolicy, false)
                    history.push(this.baseUrl);
                }}
            />
        ];
        
        return (
            <Dialog
                title={`Editing ${this.state.focusPolicy}`}
                modal={false}
                actions={actions}
                open={this.state.openEditModal}
                onRequestClose={() => this.setState({ openEditModal: false })}
                autoScrollBodyContent={true}
            >
                                <TextField
                                    hintText="Enter Allowed Users"
                                    floatingLabelText="Allowed Users"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.currentSSHParams.allowed_users}
                                    onChange={(e) => {
                                        this.setState({ currentSSHParams: update(this.state.currentSSHParams, { allowed_users: { $set: e.target.value } }) });
                                    }}
                                />               
                                <TextField
                                    hintText="Enter Default Users"
                                    floatingLabelText="Default User"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.currentSSHParams.default_user}
                                    onChange={(e) => {
                                        this.setState({ currentSSHParams: update(this.state.currentSSHParams, { default_user: { $set: e.target.value } }) });
                                    }}
                                />               
                                <TextField
                                    hintText="Enter Allowed Extensions"
                                    floatingLabelText="Allowed Extensions"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.currentSSHParams.allowed_extensions}
                                    onChange={(e) => {
                                        this.setState({ currentSSHParams: update(this.state.currentSSHParams, { allowed_extensions: { $set: e.target.value } }) });
                                    }}
                                />               
                                <TextField
                                    hintText="Enter Default Extensions"
                                    floatingLabelText="Default Extensions"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.currentSSHParams.default_extensions}
                                    onChange={(e) => {
                                        this.setState({ currentSSHParams: update(this.state.currentSSHParams, { default_extensions: { $set: e.target.value } }) });
                                    }}
                                />               
                                <TextField
                                    hintText="Enter TTL"
                                    floatingLabelText="TTL (seconds)"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.currentSSHParams.ttl}
                                    onChange={(e) => {
                                        this.setState({ currentSSHParams: update(this.state.currentSSHParams, { ttl: { $set: e.target.value } }) });
                                    }}
                                />               
                                <TextField
                                    hintText="Public Key not found"
                                    floatingLabelText="Public Key"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.currentPublicKey}
                                    onChange={(e) => {
                                    }}
                                />               
            </Dialog>
        );
    }

    renderNewSSHEngineDialog() {
        const MISSING_SSHENGINE_ERROR = "SSH Engine cannot be empty.";
        const DUPLICATE_SSHENGINE_ERROR = `SSH Engine ${this.state.focusPolicy} already exists.`;

        let validateAndSubmit = () => {
            if (this.state.focusPolicy === '') {
                snackBarMessage(new Error(MISSING_SSHENGINE_ERROR));
                return;
            }

            if (_.filter(this.state.sshEngines, x => x === this.state.focusPolicy).length > 0) {
                snackBarMessage(new Error(DUPLICATE_SSHENGINE_ERROR));
                return;
            }
            this.createSSHEngine(this.state.focusPolicy, true);
        }

        const actions = [
            <FlatButton label="Cancel" primary={true} onTouchTap={() => this.setState({ openNewSSHEngineModal: false, newSSHEngineErrorMessage: '' })} />,
            <FlatButton label="Submit" disabled={this.state.disableSubmit} primary={true} onTouchTap={validateAndSubmit} />
        ];

        let validateSSHEngineName = (event, v) => {
            var pattern = /^ssh-[^\/&]+$/;
            v = v.toLowerCase();
            if (v.match(pattern)) {
                this.setState({ newSSHEngineNameErrorMessage: '', focusPolicy: v, disableSubmit: false });
            } else {
                this.setState({ newSSHEngineNameErrorMessage: 'Illegal SSH Engine name', disableSubmit: true });
            }
        }


        return (
            <Dialog
                title={`New SSH Engine`}
                modal={false}
                actions={actions}
                open={this.state.openNewSSHEngineModal}
                onRequestClose={() => this.setState({ openNewSSHEngineModal: false, newSSHEngineErrorMessage: '' })}
                autoScrollBodyContent={true}
                autoDetectWindowHeight={true}
            >
                <TextField
                    name="Name"
                    autoFocus
                    fullWidth={true}
                    hintText="ssh-Name"
                    errorText={this.state.newSSHEngineNameErrorMessage}
                    onChange={validateSSHEngineName}
                />
                <div className={styles.error}>{this.state.newPolicyErrorMessage}</div>
            </Dialog>
        );
    }

    updateSSHEngine(sshName, isNewPolicy) {
        let params = this.state.currentSSHParams;
	        
        let default_extensions = new Object();
        for( var prop of params.default_extensions.split(',')) {
          default_extensions[prop] = '';
        }
        params.default_extensions = default_extensions;
        callVaultApi('post', `${sshName}/roles/admin`, null, params , null)
            .then(() => {
                snackBarMessage(`SSHEngine '${sshName}' updated`);
            })
            .catch((err) => {
                console.error(err.stack);
                snackBarMessage(err);
            })
        this.setState({ openNewSSHEngineModal: false });
        this.setState({ openEditModal: false });
    }

    createSSHEngine(sshName, isNewPolicy) {
        let params = new Object();
	params.type = 'ssh';
	        
        callVaultApi('post', `/sys/mounts/${sshName}`, null, params , null)
            .then(() => {
                params = new Object();
                params.generate_signing_key = true;
                callVaultApi('post', `/${sshName}/config/ca`, null, params , null)
               .then(() => {
                   params = new Object();
                   params.allow_user_certificates = true;
                   params.allowed_users = '*';
                   params.default_extensions = new Object();
                   params.default_extensions['permit-pty'] = '';
                   params.key_type = 'ca';
                   params.default_user = 'root';
                   params.ttl = '30m0s'; 
                   callVaultApi('post', `/${sshName}/roles/admin`, null, params , null)
                   .then(() => {
                       snackBarMessage(`SSHEngine '${sshName}' created`);
                       this.listSSHEngines();
                    })
                    .catch((err) => {
                      console.error(err.stack);
                      snackBarMessage(err);
                    })
               })
               .catch((err) => {
                  console.error(err.stack);
                  snackBarMessage(err);
               })

            })
            .catch((err) => {
                console.error(err.stack);
                snackBarMessage(err);
            })
        this.setState({ openNewSSHEngineModal: false });
        this.setState({ openEditModal: false });
        this.listSSHEngines();
    }

    listSSHEngines() {
        callVaultApi('get', '/sys/mounts', null, null, null)
            .then((resp) => {                
                let engines = [ ];
                for(var prop in resp.data) {
                  if(resp.data[prop] != null)
                  if(resp.data[prop].accessor)
                    if(resp.data[prop].accessor.includes("ssh_"))
                      engines.push(prop.substring(0, prop.length-1));
                }
                this.setState({
                    sshEngines: engines,
                    buttonColor: green500
                });
            })
            .catch((err) => {
                console.error(err);
                snackBarMessage(err);
            });
    }

    displaySSHEngine() {
        callVaultApi('get', `${this.props.params.splat}/roles/admin`, null, null, null)
            .then((resp) => {
                let default_extensions = [ ];
                for(var prop in resp.data.data.default_extensions) {
                      default_extensions.push(prop);
                }

                let params = resp.data.data;
                params.default_extensions = default_extensions.toString();

                callVaultApi('get', `${this.props.params.splat}/config/ca`, null, null, null)
                .then((resp) => {         
                    let pubkey = resp.data.data.public_key;          
                    this.setState({
                        openEditModal: true,
                        focusPolicy: this.props.params.splat,
                        currentSSHParams: params,
                        currentPublicKey: pubkey,
                        disableSubmit: false
                    });
                })
                .catch(snackBarMessage);
            })
            .catch(snackBarMessage);
    }

    render() {
        return (
            <div>
                {this.state.openEditModal && this.renderEditDialog()}
                {this.state.openNewSSHEngineModal && this.renderNewSSHEngineDialog()}
                {this.state.openDeleteModal && this.renderDeleteConfirmationDialog()}
                <Tabs>
                    <Tab label="Manage SSH Engines" >
                        <Paper className={sharedStyles.TabInfoSection} zDepth={0}>
                            Here you can view, update, and delete ssh engines stored in your Vault.  Just remember, <span className={styles.error}>deleting ssh engines cannot be undone!</span>
                        </Paper>
                        <Paper className={sharedStyles.TabContentSection} zDepth={0}>
                            <Toolbar>
                                <ToolbarGroup firstChild={true}>
                                    <FlatButton
                                        label="Add SSH Engine"
                                        disabled={this.state.forbidden}
                                        backgroundColor={this.state.buttonColor}
                                        hoverColor={green400}
                                        labelStyle={{ color: white }}
                                        onTouchTap={() => this.setState({
                                            openNewSSHEngineModal: true,
                                            newSSHEngineErrorMessage: '',
                                            newSSHEngineNameErrorMessage: '',
                                            disableSubmit: true,
                                            focusPolicy: '',
                                            currentSSHEngine: { path: { 'sample/path': { capabilities: ['read'] } } }
                                        })}
                                    />
                                </ToolbarGroup>
                            </Toolbar>
                            <ItemList
                                itemList={this.state.sshEngines}
                                itemUri={`${this.baseVaultPath}`}
                                maxItemsPerPage={25}
                                onDeleteTap={(deletedItem) => {
                                    snackBarMessage(`Object '${deletedItem}' deleted`)
                                    this.listSSHEngines();
                                }}
                                onTouchTap={(item) => {
                                    tokenHasCapabilities(['list'], `${item}/roles`).then(() => {
                                        history.push(`${this.baseUrl}${item}`);
                                    }).catch(() => {
                                        snackBarMessage(new Error("Access denied"));
                                    })
                                }}
                            />
                        </Paper>
                    </Tab>
                </Tabs>
            </div>
        );
    }
}
