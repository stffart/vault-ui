import React, { Component } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { callVaultApi, tokenHasCapabilities } from '../../shared/VaultUtils.jsx'
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import TextField from 'material-ui/TextField';


export default class VaultObjectRenamer extends Component {
    static propTypes = {
        path: PropTypes.string,
        open: PropTypes.bool,
        forceShowDialog: PropTypes.bool,
        onReceiveResponse: PropTypes.func,
        onReceiveError: PropTypes.func,
        onModalClose: PropTypes.func
    }

    static defaultProps = {
        path: '',
        open: false,
        forceShowDialog: false,
        onReceiveResponse: () => { },
        onReceiveError: () => { },
        onModalClose: () => { }
    }

    constructor(props) {
        super(props)

        this.state = {
            openRenameModal: this.props.open,
            path: this.props.path
        };
    }



    componentWillReceiveProps(nextProps) {
        // Trigger automatically on props change
        if (nextProps.path && !_.isEqual(nextProps.path, this.props.path)) {
            this.setState({ path: nextProps.path })
        }
        if (nextProps.open) {
            this.setState({ path: nextProps.path, openRenameModal: nextProps.open })
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.open) {
                this.setState({ openRenameModal: true })
        }
    }

    RenameObject(fullpath) {
        tokenHasCapabilities(['read'], this.props.path)
            .then(() => {
                // Load content of the secret
                callVaultApi('get', this.props.path, null, null, null)
                    .then((resp) => {
                        let secretContent = resp.data.data;
                        callVaultApi('post', this.state.path, null, secretContent, null)
                          .then(() => {
                             callVaultApi('delete', this.props.path)
                              .then((response) => {
                                 this.setState({ openRenameModal: false });
                                 this.props.onReceiveResponse(response.data);
                             })
                             .catch((err) => {
                               this.setState({ openRenameModal: false });
                               this.props.onReceiveError(err);
                             })
                        })
                        .catch((err) => {
                               this.setState({ openRenameModal: false });
                               this.props.onReceiveError(err);
                             })
                     })
                     .catch((err) => {
                         this.setState({ openRenameModal: false });
                         this.props.onReceiveError(err);
                      })
             })
             .catch(() => {
                  this.props.onReceiveError(new Error(`No permissions to read content of ${this.props.path}`));                  
                  this.setState({ openRenameModal: false });
             })

    }


    render() {
        const actions = [
            <FlatButton label="Cancel" primary={true} onTouchTap={() => { this.setState({ openRenameModal: false }); this.props.onModalClose(); }} />,
            <FlatButton label="Rename" secondary={true} onTouchTap={() => this.RenameObject(this.state.path)} />
        ];

        const style_objpath = {
            color: 'red',
            fontFamily: 'monospace',
            fontSize: '16px',
            paddingLeft: '5px'
        }

        return (  
 	    <Dialog
                title="Move/Rename Object"
                modal={true}
                open={this.state.openRenameModal}
                actions={actions}
            >
                        <p style={style_objpath}>{this.props.path}</p>
                        <TextField
                            floatingLabelFixed={true}
                            floatingLabelText="New Path"
                            hintText="Enter Path"
                            className=""
                            fullWidth={true}
                            value={this.state.path}
                            onChange={(e, v) => {
                                this.setState({ path: v });
                            }}
                        />
            </Dialog >

        )
    }
}
