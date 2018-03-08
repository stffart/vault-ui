import React from 'react';
import PropTypes from 'prop-types';
import { Tabs, Tab } from 'material-ui/Tabs';
import { Toolbar, ToolbarGroup } from 'material-ui/Toolbar';
import Subheader from 'material-ui/Subheader';
import Paper from 'material-ui/Paper';
import { List } from 'material-ui/List';
import sharedStyles from '../../shared/styles.css';
import styles from './ldap.css';
import _ from 'lodash';
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import TextField from 'material-ui/TextField';
import { callVaultApi, tokenHasCapabilities, history } from '../../shared/VaultUtils.jsx'
import ItemPicker from '../../shared/ItemPicker/ItemPicker.jsx'
import update from 'immutability-helper';
import ItemList from '../../shared/ItemList/ItemList.jsx';

function snackBarMessage(message) {
    let ev = new CustomEvent("snackbar", { detail: { message: message } });
    document.dispatchEvent(ev);
}

export default class LdapAuthBackend extends React.Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        location: PropTypes.object.isRequired
    };

    ldapGroupSchema = {
        policies: []
    }

    ldapConfigSchema = {
        url: '',
        userattr: '',
        binddn: '',
        bindpass: '',
        userdn: '',
        groupdn: '',
        groupfilter: '',
        groupattr: '',
        insecure_tls: false,
        starttls: false
    }

    constructor(props) {
        super(props);

        this.state = {
            baseUrl: `/auth/ldap/${this.props.params.namespace}/`,
            baseVaultPath: `auth/${this.props.params.namespace}`,
            groupList: [],
            newGroupId: '',
            newGroupObject: {},
            selectedGroupId: '',
            selectedGroupObject: {},
            configObj: this.ldapConfigSchema,
            newConfigObj: this.ldapConfigSchema,
            openNewGroupDialog: false,
            openEditGroupDialog: false
        }

        _.bindAll(
            this,
            'loadGroupList',
            'CreateUpdateGroup',
            'CreateUpdateConfig',
            'readConfig'
        );
    }


    loadGroupList() {
        tokenHasCapabilities(['list'], `${this.state.baseVaultPath}/groups`)
            .then(() => {
                callVaultApi('get', `${this.state.baseVaultPath}/groups`, { list: true }, null, null)
                    .then((resp) => {
                        let grouplist = _.get(resp, 'data.data.keys', []);
                        this.setState({ groupList: grouplist });
                    })
                    .catch((err) => {
                        // 404 is expected when no groups are registered
                        if (!_.has(err, 'response') || err.response.status != 404)
                            snackBarMessage(err)
                    })
            })
            .catch(() => {
                this.setState({ groupList: [] })
                snackBarMessage(new Error(`No permissions to list groups ${this.state.baseVaultPath}/groups`));
            })
    }

    displayGroup() {
        snackBarMessage(`${this.state.baseVaultPath}/groups/${this.props.params.splat}`);
        tokenHasCapabilities(['read'], `${this.state.baseVaultPath}/groups/${this.props.params.splat}`)
            .then(() => {
                callVaultApi('get', `${this.state.baseVaultPath}/groups/${this.props.params.splat}`, null, null, null)
                    .then((resp) => {
                        this.setState({ selectedGroupObject: resp.data.data, openEditGroupDialog: true });
                    })
                    .catch(snackBarMessage)
            })
            .catch(() => {
                this.setState({ selectedGroupObject: {} })
                snackBarMessage(new Error(`No permissions to display properties for group ${this.props.params.splat}`));
            })
    }

    readConfig() {
        tokenHasCapabilities(['read'], `${this.state.baseVaultPath}/config`)
            .then(() => {
                callVaultApi('get', `${this.state.baseVaultPath}/config`, null, null, null)
                    .then((resp) => {
                        this.setState({ configObj: resp.data.data, newConfigObj: resp.data.data });
                    })
                    .catch((err) => {
                        // 404 is expected when backend is not configured
                        if (!_.has(err, 'response') || err.response.status != 404)
                            snackBarMessage(err)
                    })
            })
            .catch(() => {
                snackBarMessage(new Error(`No permissions to read backend configuration ${this.state.baseVaultPath}/config`));
            })
    }

    componentDidMount() {
        if (this.props.params.splat) {
            this.setState({ selectedGroupId: this.props.params.splat });
        } else {
            this.loadGroupList();
        }
        this.readConfig();
    }

    componentWillReceiveProps(nextProps) {
        if (!_.isEqual(this.props.params.namespace, nextProps.params.namespace)) {
            // Reset
            this.setState({
                baseUrl: `/auth/ldap/${nextProps.params.namespace}/`,
                baseVaultPath: `auth/${nextProps.params.namespace}`,
                groupList: [],
                selectedGroupId: '',
                newConfigObj: this.ldapConfigSchema,
                configObj: this.ldapConfigSchema
            }, () => {
                this.loadGroupList();
                this.readConfig();
            });
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.selectedGroupId != prevState.selectedGroupId) {
            this.loadGroupList()
            if (this.state.selectedGroupId) {
                this.displayGroup();
            }
        }
    }

    CreateUpdateGroup(groupid, groupobj, create = false) {
        let fullpath = `${this.state.baseVaultPath}/groups/${groupid}`;
        let policiesStr = groupobj.policies.join(',');
        callVaultApi('post', fullpath, null, { policies: policiesStr }, null)
            .then(() => {
                if (create) {
                    this.loadGroupList();
                    this.setState({ openNewGroupDialog: false, newGroupId: '' });
                    snackBarMessage(`Group ${groupid} has been registered`);
                } else {
                    history.push(this.state.baseUrl);
                    this.setState({ openEditGroupDialog: false, selectedGroupId: '' });
                    snackBarMessage(`Group ${groupid} has been updated`);
                }
            })
            .catch(snackBarMessage)
    }

    CreateUpdateConfig(newConfig) {
        let origConfig = this.state.configObj;
        var diff = _.omitBy(newConfig, function (v, k) {
            return origConfig[k] === v;
        });
        let fullpath = `${this.state.baseVaultPath}/config`;
        callVaultApi('post', fullpath, null, diff, null)
            .then(() => {
                snackBarMessage(`Backend ${fullpath} has been configured`);
            })
            .catch(snackBarMessage)
    }

    render() {

        let renderEditGroupDialog = () => {
            const actions = [
                <FlatButton
                    label="Cancel"
                    onTouchTap={() => {
                        this.setState({ openEditGroupDialog: false, selectedGroupId: '' })
                        history.push(this.state.baseUrl);
                    }}
                />,
                <FlatButton
                    label="Save"
                    primary={true}
                    onTouchTap={() => {
                        this.CreateUpdateGroup(this.state.selectedGroupId, this.state.selectedGroupObject, false)
                    }}
                />
            ];

            return (
                <Dialog
                    title={`Editing LDAP group ${this.state.selectedGroupId}`}
                    modal={false}
                    actions={actions}
                    open={this.state.openEditGroupDialog}
                    onRequestClose={() => this.setState({ openEditGroupDialog: false, selectedGroupId: '' })}
                    autoScrollBodyContent={true}
                >
                    <List>
                        <Subheader>Assigned Policies</Subheader>
                        <ItemPicker
                            type="LDAP"
                            height="250px"
                            selectedPolicies={this.state.selectedGroupObject.policies}
                            onSelectedChange={(policies) => {
                                let group = this.state.selectedGroupObject;
                                group.policies = policies;
                                this.setState({ selectedGroupObject: group });
                            }}
                        />
                    </List>
                </Dialog>
            );
        }

        let renderNewGroupDialog = () => {
            let validateAndSubmit = () => {
                if (this.state.newGroupId === '') {
                    snackBarMessage(new Error("Group Name cannot be empty"));
                    return;
                }

                if (!_.every(this.state.groupList, (k) => { return k != this.state.newGroupId })) {
                    snackBarMessage(new Error("Group already exists"));
                    return;
                }

                this.CreateUpdateGroup(this.state.newGroupId, this.state.newGroupObject, true);
                this.setState({ openNewGroupDialog: false, newGroupId: '' });
            }

            const actions = [
                <FlatButton
                    label="Cancel"
                    onTouchTap={() => {
                        this.setState({ openNewGroupDialog: false, newGroupId: '' })
                    }}
                />,
                <FlatButton
                    label="Create"
                    primary={true}
                    onTouchTap={validateAndSubmit}
                />
            ];

            return (
                <Dialog
                    title={`Register new LDAP group`}
                    modal={false}
                    actions={actions}
                    open={this.state.openNewGroupDialog}
                    onRequestClose={() => this.setState({ openNewGroupDialog: false, newGroupId: '' })}
                    autoScrollBodyContent={true}
                >
                    <List>
                        <TextField
                            className={styles.textFieldStyle}
                            hintText="Enter the new group name"
                            floatingLabelFixed={true}
                            floatingLabelText="Group Name"
                            fullWidth={false}
                            autoFocus
                            onChange={(e) => {
                                this.setState({ newGroupId: e.target.value });
                            }}
                        />
                        <Subheader>Assigned Policies</Subheader>
                        <ItemPicker
                            height="200px"
                            selectedPolicies={this.state.newGroupObject.policies}
                            onSelectedChange={(policies) => {
                                let group = this.state.newGroupObject;
                                group.policies = policies;
                                this.setState({ newGroupObject: group });
                            }}
                        />
                    </List>
                </Dialog>
            );
        }

        return (
            <div>
                {this.state.openEditGroupDialog && renderEditGroupDialog()}
                {this.state.openNewGroupDialog && renderNewGroupDialog()}
                <Tabs>
                    <Tab label="Manage Groups" >
                        <Paper className={sharedStyles.TabInfoSection} zDepth={0}>
                            Here you can add, edit or delete groups registred with this backend
                        </Paper>
                        <Paper className={sharedStyles.TabContentSection} zDepth={0}>
                            <Toolbar>
                                <ToolbarGroup firstChild={true}>
                                    <FlatButton
                                        primary={true}
                                        label="NEW GROUP"
                                        disabled={this.state.newSecretBtnDisabled}
                                        onTouchTap={() => {
                                            this.setState({
                                                openNewGroupDialog: true,
                                                newGroupId: '',
                                                newGroupObject: _.clone(this.ldapGroupSchema)
                                            })
                                        }}
                                    />
                                </ToolbarGroup>
                            </Toolbar>
                            <ItemList
                                itemList={this.state.groupList}
                                itemUri={`${this.state.baseVaultPath}/groups`}
                                maxItemsPerPage={25}
                                onDeleteTap={(deletedItem) => {
                                    snackBarMessage(`Group '${deletedItem}' deleted`)
                                    this.loadGroupList();
                                }}
                                onTouchTap={
                                    (item) => {
                                        this.setState({ newGroupId: '' });
                                        tokenHasCapabilities(['read'], `${this.state.baseVaultPath}/groups/${item}`).then(() => {
                                            this.setState({ selectedGroupId: item });
                                            history.push(`${this.state.baseUrl}${item}`);
                                        }).catch(() => {
                                            snackBarMessage(new Error("Access denied"));
                                        })

                                    }}
                            />
                        </Paper>
                    </Tab>
                    <Tab label="Configure Backend" >
                        <Paper className={sharedStyles.TabInfoSection} zDepth={0}>
                            Here you can configure connection details to your LDAP server. Optionally you can assign a default set of policies to assign to unregistred groups
                        </Paper>
                        <Paper className={sharedStyles.TabContentSection} zDepth={0}>
                            <List>
                                <TextField
                                    hintText="Enter the LDAP URL"
                                    floatingLabelText="LDAP URL"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.url}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { url: { $set: e.target.value } }) });
                                    }}
                                />
                                <TextField
                                    hintText="Enter the LDAP Bind DN"
                                    floatingLabelText="LDAP Bind DN"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.binddn}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { binddn: { $set: e.target.value } }) });
                                    }}
                                />
                                <TextField
                                    hintText="Enter the LDAP Bind Pass"
                                    floatingLabelText="LDAP Bind Pass"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.bindpass}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { bindpass: { $set: e.target.value } }) });
                                    }}
                                />
                                <TextField
                                    hintText="Enter LDAP User DN"
                                    floatingLabelText="LDAP User DN"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.userdn}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { userdn: { $set: e.target.value } }) });
                                    }}
                                />
                                <TextField
                                    hintText="Enter LDAP User Attribute"
                                    floatingLabelText="LDAP User Attribute"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.userattr}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { userattr: { $set: e.target.value } }) });
                                    }}
                                />
                                <TextField
                                    hintText="Enter LDAP Group DN"
                                    floatingLabelText="LDAP Group DN"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.groupdn}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { groupdn: { $set: e.target.value } }) });
                                    }}
                                />
                                <TextField
                                    hintText="Enter LDAP Group Attribute"
                                    floatingLabelText="LDAP Group Attribute"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.groupattr}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { groupattr: { $set: e.target.value } }) });
                                    }}
                                />
                                <TextField
                                    hintText="Enter LDAP Group Filter"
                                    floatingLabelText="LDAP Group Filter"
                                    fullWidth={true}
                                    floatingLabelFixed={true}
                                    value={this.state.newConfigObj.groupfilter}
                                    onChange={(e) => {
                                        this.setState({ newConfigObj: update(this.state.newConfigObj, { groupfilter: { $set: e.target.value } }) });
                                    }}
                                />

                                <div style={{ paddingTop: '20px', textAlign: 'center' }}>
                                    <FlatButton
                                        primary={true}
                                        label="Save"
                                        onTouchTap={() => this.CreateUpdateConfig(this.state.newConfigObj)}
                                    />
                                </div>
                            </List>
                        </Paper>
                    </Tab>
                </Tabs>
            </div>
        )
    }
}
