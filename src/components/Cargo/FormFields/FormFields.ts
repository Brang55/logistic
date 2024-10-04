export interface FormField {
  name: string;
  label: string;
  type:
    | "text"
    | "tel"
    | "email"
    | "number"
    | "date"
    | "textarea"
    | "select"
    | "file";
  required: boolean;
  options?: string[];
}

export const formFields: FormField[] = [
  {
    name: "shipperName",
    label: "Shipper's Name",
    type: "text",
    required: true,
  },
  {
    name: "shipperAddress",
    label: "Shipper's Address",
    type: "text",
    required: true,
  },
  {
    name: "contactPerson",
    label: "Contact Person",
    type: "text",
    required: true,
  },
  { name: "phoneNumber", label: "Phone Number", type: "tel", required: true },
  {
    name: "emailAddress",
    label: "Email Address",
    type: "email",
    required: true,
  },
  {
    name: "receiverName",
    label: "Receiver's Name",
    type: "text",
    required: true,
  },
  {
    name: "receiverAddress",
    label: "Receiver's Address",
    type: "text",
    required: true,
  },
  {
    name: "receiverContact",
    label: "Contact Person",
    type: "text",
    required: true,
  },
  { name: "receiverPhone", label: "Phone Number", type: "tel", required: true },
  {
    name: "receiverEmail",
    label: "Email Address",
    type: "email",
    required: true,
  },
  {
    name: "descriptionOfGoods",
    label: "Description of Goods",
    type: "textarea",
    required: true,
  },
  { name: "quantity", label: "Quantity", type: "number", required: true },
  { name: "weight", label: "Weight (kg)", type: "number", required: true },
  {
    name: "dimensions",
    label: "Dimensions (LxWxH in cm)",
    type: "text",
    required: true,
  },
  { name: "pickupDate", label: "Pickup Date", type: "date", required: true },
  {
    name: "deliveryDate",
    label: "Delivery Date",
    type: "date",
    required: true,
  },
  {
    name: "pickupLocation",
    label: "Pickup Location (City, Country)",
    type: "text",
    required: true,
  },
  {
    name: "deliveryLocation",
    label: "Delivery Location (City, Country)",
    type: "text",
    required: true,
  },
  {
    name: "truckType",
    label: "Type of Truck Required",
    type: "select",
    options: ["Flatbed", "Refrigerated", "Box", "Tanker"],
    required: true,
  },
  {
    name: "serviceType",
    label: "Type of Service",
    type: "select",
    options: ["Door-to-Door", "Terminal-to-Terminal"],
    required: true,
  },
  {
    name: "temperatureControl",
    label: "Temperature Control",
    type: "text",
    required: false,
  },
  {
    name: "hazardousMaterial",
    label: "Hazardous Material",
    type: "text",
    required: false,
  },
  {
    name: "specialHandlingInstructions",
    label: "Special Handling Instructions",
    type: "textarea",
    required: false,
  },
  {
    name: "freightCost",
    label: "Freight Cost",
    type: "number",
    required: true,
  },
  {
    name: "paymentTerms",
    label: "Payment Terms",
    type: "select",
    options: ["Prepaid", "Collect"],
    required: true,
  },
  { name: "notes", label: "Notes", type: "textarea", required: false },
  //   { name: "attachments", label: "Attachments", type: "file", required: false },
];
