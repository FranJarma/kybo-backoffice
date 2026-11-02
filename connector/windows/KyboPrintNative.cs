using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

namespace Kybo.Print {
 public static class Native {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct DOC_INFO_1 { public string pDocName,pOutputFile,pDatatype; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct JOB_INFO_1 { public uint JobId; public IntPtr pPrinterName,pMachineName,pUserName,pDocument,pDatatype,pStatus; public uint Status,Priority,Position,TotalPages,PagesPrinted; public SYSTEMTIME Submitted; }
  [StructLayout(LayoutKind.Sequential)] struct SYSTEMTIME { public ushort Year,Month,DayOfWeek,Day,Hour,Minute,Second,Milliseconds; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string name,out IntPtr handle,IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern uint StartDocPrinter(IntPtr h,uint level,ref DOC_INFO_1 doc);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h,byte[] bytes,int count,out int written);
  [DllImport("winspool.drv", EntryPoint="EnumJobsW", SetLastError=true)] static extern bool EnumJobs(IntPtr h,uint first,uint count,uint level,IntPtr buffer,uint size,out uint needed,out uint returned);
  [DllImport("winspool.drv", EntryPoint="SetJobW", SetLastError=true)] static extern bool SetJob(IntPtr h,uint id,uint level,IntPtr job,uint command);
  static IntPtr Open(string name) { IntPtr h; if(String.IsNullOrWhiteSpace(name)||!OpenPrinter(name,out h,IntPtr.Zero)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); return h; }
  public static int Submit(string queue,string name,byte[] bytes) {
   IntPtr h=Open(queue); uint id=0; bool ended=false;
   try { var d=new DOC_INFO_1 { pDocName=name,pDatatype="RAW" }; id=StartDocPrinter(h,1,ref d); if(id==0) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); int n; if(!WritePrinter(h,bytes,bytes.Length,out n)||n!=bytes.Length) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); if(!EndDocPrinter(h)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); ended=true; return checked((int)id); }
   finally { if(id!=0&&!ended) EndDocPrinter(h); ClosePrinter(h); }
  }
  public static bool Cancel(string queue,int id) { IntPtr h=Open(queue); try { return SetJob(h,(uint)id,0,IntPtr.Zero,3); } finally { ClosePrinter(h); } }
  public static string Status(string queue) { try { IntPtr h=Open(queue); ClosePrinter(h); return "unknown"; } catch { return "error"; } }
  public static string PresenceFromEntries(string[] names, int[] ids, string name, object jobId, bool complete) {
   if (!complete || names == null || ids == null || names.Length != ids.Length || String.IsNullOrEmpty(name)) return "unknown";
   bool conflictingId = false;
   for (int i = 0; i < names.Length; i++) {
    if (String.Equals(names[i],name,StringComparison.Ordinal)) return "present";
    if (jobId != null && Convert.ToInt64(jobId) == ids[i]) conflictingId = true;
   }
   return conflictingId ? "unknown" : "removed";
  }
  public static string Presence(string queue,string name,object jobId) {
   IntPtr h=IntPtr.Zero,buf=IntPtr.Zero;
   try { h=Open(queue); uint needed,returned; bool emptyOk=EnumJobs(h,0,10000,1,IntPtr.Zero,0,out needed,out returned); if(needed==0) return emptyOk ? "removed" : "unknown";
    buf=Marshal.AllocHGlobal((int)needed); if(!EnumJobs(h,0,10000,1,buf,needed,out needed,out returned)) return "unknown";
    int size=Marshal.SizeOf(typeof(JOB_INFO_1)); var names=new string[returned]; var ids=new int[returned]; for(int i=0;i<returned;i++) { var j=(JOB_INFO_1)Marshal.PtrToStructure(IntPtr.Add(buf,i*size),typeof(JOB_INFO_1)); names[i]=Marshal.PtrToStringUni(j.pDocument); ids[i]=checked((int)j.JobId); } return PresenceFromEntries(names,ids,name,jobId,returned<10000);
   } catch { return "unknown"; } finally { if(buf!=IntPtr.Zero) Marshal.FreeHGlobal(buf); if(h!=IntPtr.Zero) ClosePrinter(h); }
  }
  static string Safe(string text) { var b=new StringBuilder(); foreach(char c in text ?? "") if(!Char.IsControl(c)) b.Append(c); return b.ToString(); }
  public static byte[] Render(string json,string logoPath,int width) {
   if(width!=384 && width!=512 && width!=576) throw new ArgumentException("Invalid width");
   var serializer=new JavaScriptSerializer(); serializer.MaxJsonLength=2000000;
   var doc=serializer.Deserialize<Dictionary<string,object>>(json);
   if(Convert.ToInt32(doc["version"])!=1 || Convert.ToInt32(doc["widthDots"])!=576) throw new ArgumentException("Invalid document");
   var rows=(System.Collections.IEnumerable)doc["lines"]; var strips=new List<Bitmap>(); int total=0;
   try {
    if(Convert.ToBoolean(doc["logo"])) { using(var image=Image.FromFile(logoPath)) { int w=Math.Min(width-32,220),h=Math.Max(1,(int)(image.Height*(double)w/image.Width)); var logo=new Bitmap(width,h+16); using(var g=Graphics.FromImage(logo)) { g.Clear(Color.White); g.DrawImage(image,(width-w)/2,0,w,h); } strips.Add(logo); total+=logo.Height; } }
    foreach(object obj in rows) { var line=(Dictionary<string,object>)obj; string style=Convert.ToString(line["style"]); if(style!="normal"&&style!="bold"&&style!="title"&&style!="heading"&&style!="small") throw new ArgumentException("Invalid style");
     float fontSize=style=="title" ? 26 : style=="heading" ? 21 : style=="small" ? 15 : 19;
     using(var font=new Font("Arial",fontSize,(style=="bold"||style=="title"||style=="heading") ? FontStyle.Bold : FontStyle.Regular,GraphicsUnit.Pixel))
     using(var probe=new Bitmap(1,1)) using(var measure=Graphics.FromImage(probe)) using(var format=new StringFormat()) {
      format.Alignment=(line.ContainsKey("align") && Convert.ToString(line["align"])=="center") ? StringAlignment.Center : StringAlignment.Near;
      string text=Safe(Convert.ToString(line["text"])); var measured=measure.MeasureString(text.Length==0 ? " " : text,font,width-20,format); int height=Math.Max((int)Math.Ceiling(measured.Height)+4,20);
      if(height>20000 || total+height>100000) throw new ArgumentException("Document too long");
      var strip=new Bitmap(width,height); using(var g=Graphics.FromImage(strip)) { g.Clear(Color.White); g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit; g.DrawString(text,font,Brushes.Black,new RectangleF(10,0,width-20,height),format); } strips.Add(strip); total+=height;
     }
    }
    using(var output=new MemoryStream()) { output.Write(new byte[]{27,64},0,2); foreach(var bitmap in strips) { int rowBytes=width/8; for(int y0=0;y0<bitmap.Height;y0+=255) { int h=Math.Min(255,bitmap.Height-y0); byte[] header={29,118,48,0,(byte)rowBytes,(byte)(rowBytes>>8),(byte)h,(byte)(h>>8)}; output.Write(header,0,header.Length); for(int y=y0;y<y0+h;y++) for(int x=0;x<width;x+=8) { byte bits=0; for(int k=0;k<8;k++) { var p=bitmap.GetPixel(x+k,y); if(p.R*299+p.G*587+p.B*114<128000) bits|=(byte)(128>>k); } output.WriteByte(bits); } } } output.Write(new byte[]{10,10,10,29,86,0},0,6); return output.ToArray(); }
   } finally { foreach(var bitmap in strips) bitmap.Dispose(); }
  }
 }
}
