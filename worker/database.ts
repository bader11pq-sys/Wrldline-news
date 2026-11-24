export const officeResource=(env:{OFFICE_DB_NAMESPACE?:string},name:string)=>
  env.OFFICE_DB_NAMESPACE==='wrldline_office' ? `wrldline_office_${name.replace(/^office_/,'')}` : name;
export const officeBucket=(env:{OFFICE_DB_NAMESPACE?:string})=>
  env.OFFICE_DB_NAMESPACE==='wrldline_office' ? 'wrldline-office-images' : 'office-images';
