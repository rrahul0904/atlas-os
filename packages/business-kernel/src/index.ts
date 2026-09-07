export type CanonicalBusinessEntityType=
  "contact"|"lead"|"opportunity"|"location"|"resource"|"booking"|"catalog_item"|"order"|"fulfillment"|"inventory_item"|"invoice"|"task";

export interface BusinessTerminology{
  contact:string;
  contactPlural:string;
  booking:string;
  bookingPlural:string;
  resource:string;
  resourcePlural:string;
  catalogItem:string;
  catalogItemPlural:string;
  order:string;
  orderPlural:string;
  fulfillment:string;
}

const terminology:Record<string,BusinessTerminology>={
  default:{contact:"Contact",contactPlural:"Contacts",booking:"Booking",bookingPlural:"Bookings",resource:"Resource",resourcePlural:"Resources",catalogItem:"Product or service",catalogItemPlural:"Products and services",order:"Order",orderPlural:"Orders",fulfillment:"Fulfillment"},
  founder:{contact:"Contact",contactPlural:"Contacts",booking:"Meeting",bookingPlural:"Meetings",resource:"Resource",resourcePlural:"Resources",catalogItem:"Offer",catalogItemPlural:"Offers",order:"Order",orderPlural:"Orders",fulfillment:"Delivery"},
  dental:{contact:"Patient",contactPlural:"Patients",booking:"Appointment",bookingPlural:"Appointments",resource:"Chair / provider",resourcePlural:"Chairs / providers",catalogItem:"Service",catalogItemPlural:"Services",order:"Service order",orderPlural:"Service orders",fulfillment:"Service completion"},
  restaurant:{contact:"Guest",contactPlural:"Guests",booking:"Reservation",bookingPlural:"Reservations",resource:"Table / room",resourcePlural:"Tables / rooms",catalogItem:"Experience",catalogItemPlural:"Experiences",order:"Order",orderPlural:"Orders",fulfillment:"Service completion"},
  bakery:{contact:"Customer",contactPlural:"Customers",booking:"Pickup / production slot",bookingPlural:"Pickup / production slots",resource:"Production resource",resourcePlural:"Production resources",catalogItem:"Product",catalogItemPlural:"Products",order:"Order",orderPlural:"Orders",fulfillment:"Fulfillment"}
};

export function terminologyFor(verticalId:string):BusinessTerminology{
  return terminology[verticalId]??terminology.default;
}

export function kernelEntityRef(type:CanonicalBusinessEntityType,id:string){
  if(!id.trim())throw new Error("kernel-entity-id-required");
  return{type,id};
}
