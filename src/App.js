import React, { Component } from 'react';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import {
  Table,
  TableBody,
  TableHeader,
  TableHeaderColumn,
  TableRow,
  TableRowColumn,
} from 'material-ui/Table';
import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import FlatButton from 'material-ui/FlatButton';
import Dialog from 'material-ui/Dialog';
import changesets from 'diff-json';
import filterValues from 'filter-values';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';

const fs = window.require('mz/fs');
const electron = window.require("electron");


class App extends Component {
  constructor() {
    super();
    this.state = {
      newRow: {},
      limit: 10,
    };
    // const jsonWithMeta = data.map((row, i) => ({ ...row, $index: i }));
    // this.state = {
    //   data: jsonWithMeta,
    //   fields: ['id', 'field2', 'field3'],
    //   newRow: {},
    // };
  }
  getTableHeaderColumns() {
    return this.state.fields.concat(['ACTIONS']).map(field => <TableHeaderColumn key={field}>{field}</TableHeaderColumn>);
  }
  getNonDeletedRows() {
    return this.state.data
      .filter(row => !row.$deleted);
  }
  getFilteredRows() {
    let rows = this.getNonDeletedRows();
    if (this.state.search) {
      rows = rows.filter(row => this.state.fields.find(field => row[field].includes(this.state.search)));
    }
    return rows.slice(0, this.state.limit);
  }
  handleNewRowInputChange = (field, { target: { value } }) => {
    this.setState({
      newRow: {
        ...this.state.newRow,
        [field]: value,
      }
    });
  };
  getTableRows() {
    return [
      ...this.getDataRows(),
      this.getNewRow(),
    ];
  }
  addNewRow = () => {
    if (!this.state.newRow.id) {
      alert('id is missing')
    } else if (this.getNonDeletedRows().find(row => row.id === this.state.newRow.id)) {
      alert('id already exists');
    } else {
      this.setState({
        newRow: {},
        data: [
          ...this.state.data,
          {
            ...this.state.newRow,
            $index: this.state.data.length,
          },
        ],
      });
    }
  };
  getNewRow() {
    return (
      <TableRow key="new" style={{
        borderBottom: '1px solid rgb(224, 224, 224)'
      }}>
        {
          this.state.fields.map(field => (
            <Column key={field}>
              <ColumnTextField
                underlineShow={false}
                value={this.state.newRow[field]}
                onChange={val => this.handleNewRowInputChange(field, val)}
              />
            </Column>
          ))
        }
        < Column key="$actions" >
          <RaisedButton
            label="Add"
            onClick={this.addNewRow}
            backgroundColor="gray"
            style={{ margin: 5 }}
          />
        </Column >
      </TableRow >
    );
  }
  getDataRows() {
    return this.getFilteredRows()
      .map(row => (
        <TableRow key={row.$index}>
          {this.state.fields.map(field => (
            <Column key={field}>
              <ColumnTextField
                underlineShow={false}
                value={row[field]}
                onChange={val => this.handleInputChange(row.$index, field, val)}
              />
            </Column>
          ))}
          <Column key="$actions">
            <RaisedButton
              label="Delete"
              onClick={() => this.deleteRow(row)}
              backgroundColor="gray"
              style={{ margin: 5 }}
            />
            <RaisedButton
              label="Copy to new row form"
              onClick={() => this.copyToNewRow(row)}
              backgroundColor="gray"
              style={{ margin: 5 }}
            />
          </Column>
        </TableRow>
      ));
  }
  copyToNewRow = row => {
    this.setState({
      newRow: row,
    });
  };
  deleteRow = row => {
    const newData = Object.assign([], this.state.data);
    newData[row.$index] = {
      ...row,
      $deleted: true,
    };
    this.setState({
      data: newData,
    });
  };
  handleInputChange = (rowIndex, field, ev) => {
    const newVal = ev.target.value;
    const newData = Object.assign([], this.state.data);
    newData[rowIndex] = {
      ...this.state.data[rowIndex],
      [field]: newVal,
    };
    this.setState({
      data: newData,
    });
  };
  getDataWithoutMetaFields() {
    return this.getNonDeletedRows().map(row => filterValues(row, (_, key) => key !== '$index'));
  }
  triggerApplyChangesVerification = () => {
    const ids = this.getNonDeletedRows().map(row => row.id);
    if (ids.find(id => !id)) {
      alert('There are some rows with missing ids!');
    }
    const duplicateIds = getDuplicates(ids);
    if (duplicateIds.length) {
      alert(`The IDs ${duplicateIds.map(id => `'${id}'`).join(', ')} exist more then once. Please fix it before you apply the changes`);
    } else {
      this.setState({ applyChangesDialog: true });
    }
  };
  handleSearchChange = ({ target: { value } }) => {
    this.setState({ search: value });
  }
  closeApplyChangesDialog = () => {
    this.setState({ applyChangesDialog: false });
  };
  applyChanges = async () => {
    const diffs = this.getDiff();
    const newFileContents = { ...this.state.oldJson };
    changesets.applyChanges(newFileContents, diffs);
    await fs.writeFile(this.state.fileName, JSON.stringify(newFileContents));
    this.setState({ applyChangesDialog: false });
  };
  getApplyChangesDialog() {
    const actions = [
      <FlatButton
        label="Cancel"
        primary={true}
        onClick={this.closeApplyChangesDialog}
      />,
      <FlatButton
        label="Apply Changes"
        primary={true}
        onClick={this.applyChanges}
      />,
    ];
    if (this.state.applyChangesDialog) {
      const diff = this.getDiff();
      return (
        <Dialog
          title="Congirm Changes"
          actions={actions}
          modal={false}
          open={this.state.applyChangesDialog}
          onRequestClose={this.closeApplyChangesDialog}
        >
          {formatDiff(diff)}
        </Dialog>
      );
    }
  }
  getDiff() {
    return changesets.diff({ data: this.state.oldJson.data }, { data: this.getDataWithoutMetaFields() }, { data: 'id' });;
  }
  openFile = () => {
    electron.remote.dialog.showOpenDialog({
      filters: [
        { name: 'json', extensions: ['json'] }
      ]
    }, async fileNames => {
      if (fileNames) {
        const fileName = fileNames[0];
        const fileContents = await fs.readFile(fileName, 'utf8');
        const parsed = JSON.parse(fileContents);
        this.setState({
          fileName,
          data: parsed.data.map((row, i) => ({ ...row, $index: i })),
          fields: parsed.fields,
          oldJson: parsed,
        });
      }
    });
  };
  handleLimitSelectChange = ({ target: { value } }) => {
    this.setState({ limit: value });
  };
  showData() {
    if (this.state.data) {
      return (
        <div>
          Search Here:<TextField
            value={this.state.search}
            onChange={this.handleSearchChange}
          />
          <SelectField
            floatingLabelText="Limit to"
            value={this.state.limit}
            onChange={this.handleLimitSelectChange}
          >
            {[10, 20, 50, 100].map(num => <MenuItem key={num} value={num} primaryText={num} />)}
          </SelectField>
          <Table>
            <TableHeader adjustForCheckbox={false} displaySelectAll={false}>
              <TableRow>
                {this.getTableHeaderColumns()}
              </TableRow>
            </TableHeader>
            <TableBody displayRowCheckbox={false}>
              {this.getTableRows()}
            </TableBody>
          </Table>
          <RaisedButton
            label="Apply Changes"
            onClick={this.triggerApplyChangesVerification}
            backgroundColor="gray"
            style={{ margin: 5 }}
          />
        </div>
      );
    }
  }
  render() {
    return (
      <MuiThemeProvider>
        <div>
          {this.getApplyChangesDialog()}
          <RaisedButton
            label="Open File"
            onClick={this.openFile}
            backgroundColor="gray"
            style={{ margin: 5 }}
          />
          {this.showData()}
        </div>
      </MuiThemeProvider>
    );
  }
}

export default App;

function getDuplicates(arr) {

  var uniq = arr
    .map((el) => {
      return { count: 1, el: el }
    })
    .reduce((a, b) => {
      a[b.el] = (a[b.el] || 0) + b.count
      return a
    }, {})

  return Object.keys(uniq).filter((a) => uniq[a] > 1)
}

function formatDiff(diff) {
  if (diff.length) {
    return diff[0].changes.map(keyChange => (
      <div>
        <div><b>ID '{keyChange.key}'</b></div>
        <div>
          {formatSubChanges(keyChange)}
        </div>
      </div>
    ));
  }
  return <div>No changes were made</div>;
}

function formatSubChanges(keyChange) {
  switch (keyChange.type) {
    case 'update':
      return keyChange.changes.map(change => (
        <div>
          Field '{change.key}' changed from '{change.oldValue}' to '{change.value}'
        </div>
      ));
    case 'add':
      return (
        <div>
          Row {JSON.stringify(keyChange.value)} was added
        </div>
      );
    case 'remove':
      return (
        <div>
          Removed
        </div>
      );
  }
}

function Column(props) {
  return (
    <TableRowColumn {...props}
      style={{
        borderRight: '1px solid rgb(224, 224, 224)',
        ...props.style,
      }}
    />
  );
}

function ColumnTextField(props) {
  return (
    <TextField
      underlineShow={false}
      {...props}
      style={{
        width: '100%',
        ...props.style,
      }}
    />
  );
}