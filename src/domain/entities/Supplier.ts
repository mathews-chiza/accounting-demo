import BaseEntity from "./base/BaseEntity";

export default class Supplier extends BaseEntity {
  name!: string;
  email?: string;
  phone?: string;
  address?: string;
}
