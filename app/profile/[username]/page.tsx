"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import Link from "next/link";
import {ArrowRight,Package,Download} from "lucide-react";

type Creator={id:string;username:string;role:string};
type Product={id:string;name:string;description:string;version:string;is_free:boolean;price:number;icon_url:string|null;download_count?:number};
const money=(n:number)=>new Intl.NumberFormat("fa-IR").format(n)+" تومان";

export default function CreatorProfilePage(){
 const params=useParams();
 const username=decodeURIComponent(String(params.username||""));
 const [creator,setCreator]=useState<Creator|null>(null);
 const [products,setProducts]=useState<Product[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{
  let active=true;
  async function load(){
   try{
    const response=await fetch(`/api/creators/${encodeURIComponent(username)}`);
    const data: any=await response.json();
    if(!response.ok)throw new Error(data.error||"Could not load creator profile.");
    if(!active)return;
    setCreator(data.creator as Creator);
    setProducts((data.products||[]) as Product[]);
   }catch{
    if(active)setError("دریافت اطلاعات این سازنده ناموفق بود.");
   }finally{
    if(active)setLoading(false);
   }
  }
  load();
  return()=>{active=false;};
 },[username]);

 const downloads=products.reduce((sum,item)=>sum+(Number(item.download_count)||0),0);
 if(loading)return <main className="creator-profile"><p>در حال دریافت پروفایل...</p></main>;
 if(!creator)return <main className="creator-profile"><Link className="btn outline" href="/"><ArrowRight size={17}/> بازگشت به فروشگاه</Link><div className="empty-state"><Package/><h2>پروفایل پیدا نشد</h2><p>{error}</p></div></main>;

 return <main className="creator-profile">
  <Link className="btn outline" href="/"><ArrowRight size={17}/> بازگشت به فروشگاه</Link>
  <section className="profile-banner"><div className="profile-avatar">{creator.username.slice(0,1).toUpperCase()}</div><div><div className="eyebrow">RPCRAFT CREATOR PROFILE</div><h1>{creator.username}</h1><p>عضو جامعه سازندگان RPCRAFT SHOP</p><span className="profile-role">{creator.role==="owner"?"مالک سایت":creator.role==="admin"?"مدیر":creator.role==="seller"?"فروشنده":"عضو"}</span></div></section>
  <section className="profile-stats"><div className="profile-stat"><small>پلاگین‌های منتشرشده</small><b>{products.length.toLocaleString("fa-IR")}</b></div><div className="profile-stat"><small>مجموع دانلودها</small><b>{downloads.toLocaleString("fa-IR")}</b></div><div className="profile-stat"><small>نوع حساب</small><b>{creator.role==="seller"||creator.role==="owner"?"سازنده":"کاربر"}</b></div></section>
  <div className="profile-products-heading"><h2>پلاگین‌های منتشرشده</h2><span>{products.length.toLocaleString("fa-IR")} محصول</span></div>
  {products.length?<div className="profile-product-grid">{products.map(product=><Link href={`/plugin/${product.id}`} className="profile-product" key={product.id}><div className="profile-product-icon">{product.icon_url?<img src={product.icon_url} alt={product.name}/>:<Package size={35}/>}</div><h3>{product.name}</h3><p>{product.description}</p><small>{product.is_free?"رایگان":money(product.price)} · نسخه {product.version}</small><p><Download size={13} style={{display:"inline",verticalAlign:"middle"}}/> {(Number(product.download_count)||0).toLocaleString("fa-IR")} دانلود</p></Link>)}</div>:<div className="empty-state"><Package/><h3>هنوز پلاگینی منتشر نشده است</h3><p>محصولات تأییدشده این سازنده در این بخش نمایش داده می‌شوند.</p></div>}
  {error&&<p className="form-hint">{error}</p>}
 </main>;
}
