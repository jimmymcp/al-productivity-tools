import IDataItem from "./data-item.model";

export default interface IDataSet {
  dataItems: Array<IDataItem>;
  postLabelComments: string[];
  comments: string[];
}

