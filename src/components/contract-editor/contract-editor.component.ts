import {Component, Input, Output, EventEmitter, OnInit} from '@angular/core';
import {ContractEditorService} from './contract-editor.service';
import {Loan} from '../../services/entity/Loan.entity';
import {Paginator} from '../../services/entity/Paginator.entity';
import {DictionaryService} from '../../services/dictionary/dictionary.service';
import {Signatory} from '../../services/entity/Signatory.entity';
import {Signature} from '../../services/entity/Signature.entity';
import {PopService} from 'dolphinng';
import {Resource} from '../../services/entity/Resource.entity';
import {Uploader,UploadFile} from 'dolphinng';
import {api_file} from '../../services/config/app.config';
import {Contract} from '../../services/entity/Contract.entity';
import {Toaster} from 'dolphinng';
@Component({
  selector: 'contract-editor',
  templateUrl: './contract-editor.component.html',
  styleUrls: ['./contract-editor.component.less'],
  providers: [ContractEditorService, DictionaryService, PopService,Uploader]
})
export class ContractEditorComponent implements OnInit{
  @Input() visible: boolean;
  @Input() associateId: string;//关联ID
  @Input() businessType: string='0406';//业务类型 0406融资合同  0407展期合同
  private _borrowApplyId: string;
  resourceId: string;
  @Output() visibleChange: EventEmitter<any> = new EventEmitter();
  @Output() complete: EventEmitter<any> = new EventEmitter();
  contractTitle: string = '';//合同标题
  contractNum: string = '';//合同编号
  wouldSign: boolean = true;//是否送签
  fileId: string = '';//文件ID
  fileName: string = '';//合同PDF文件名
  loan: Loan = new Loan();
  signatures: Signature[] = [];
  resources: Resource[];
  submitted: boolean = false;

  modalPickSignatory = {
    visible: false,
    data: [],
    signatoryTypes: [],
    params: {
      name: '',
      type: 0
    },
    signatureIndex: 0,//下标
    paginator: new Paginator()
  };
  contractSignatoryPicker:ContractSignatoryPicker;

  @Input()
  set borrowApplyId(newVal: string) {
    this._borrowApplyId = newVal;
    if (newVal) {
      this.loadLoan();
      this.addNewSignature();
    }
  }

  get borrowApplyId(): string {
    return this._borrowApplyId;
  }

  constructor(
    private contractEditorSvc: ContractEditorService,
    private dictionarySvc: DictionaryService,
    private pop: PopService,
    private toaster: Toaster,
    public uploader:Uploader
  ) {
    this.contractSignatoryPicker=new ContractSignatoryPicker(this.contractEditorSvc);
    this.contractSignatoryPicker.onComplete((signatures:Signature[])=>{
      if(this.signatures.length===1) {
        if(!this.signatures[0].userId){
          this.signatures=[];
        }
      }
       this.signatures=this.signatures.concat(signatures);
      this.open();
    });

    this.contractEditorSvc.loadResources({
      resourceType:1
    })
      .then((res)=> {
        this.resources = res;
        if(this.resources.length>0) {
          this.resourceId = this.resources[0].resourceId;
        }
      });

    this.initUploader();

  }

  ngOnInit(){
  }

  initUploader(){
    this.uploader.url=api_file.upload;
    this.uploader.onQueue((uploadFile:UploadFile)=>{
      uploadFile.addSubmitData('businessType',this.businessType);
      uploadFile.addSubmitData('fileName',uploadFile.fileName);
      uploadFile.addSubmitData('fileType',uploadFile.fileExtension);
      uploadFile.addSubmitData('fileSize',uploadFile.fileSize);
      uploadFile.addSubmitData('fileContent',uploadFile.getFile());
      this.fileName=uploadFile.fileName;
    });
    this.uploader.onQueueAll((uploadFiles)=>{
      if(uploadFiles.length>1){
        this.uploader.queue=[uploadFiles[uploadFiles.length-1]];
      }
      if(this.uploader.queue[0].fileExtension!=='.pdf'){
        this.toaster.error('','请上传PDF文件！');
        this.uploader.queue=[];
      }else{
        this.uploader.upload();
      }
    });
    this.uploader.onSuccess((uploadFile,uploader,index)=>{//上传请求成功
      let response=JSON.parse(uploadFile.response);
      if(response.status==200){
        setTimeout(()=>{
          uploadFile.setSuccess();
        },500);
        uploadFile.customData={
          fileId:response.body.fileId
        };
        this.fileId=response.body.fileId;
      }else{
        uploadFile.setError();
      }
    });
    this.uploader.onError((uploadFile,uploader,index)=>{//上传请求成功
      uploadFile.setError();
    });
  }


  removeUploadFile(index:number){
    if(this.uploader.queue[index].uploaded&&this.uploader.queue[index].success){
      this.contractEditorSvc.deleteFile(this.uploader.queue[index].customData.fileId)
        .then((res)=>{
          if(res.status){
            this.uploader.queue.splice(index,1);
            this.fileId='';
            this.fileName='';
          }else{
            this.toaster.error('',res.message||'删除文件失败！');
          }
        })
    }else{
      this.uploader.queue.splice(index,1);
      this.fileId='';
      this.fileName='';
    }
  }

  loadLoan() {
    this.contractEditorSvc.getLoanById(this.borrowApplyId)
      .then((data)=> {
        this.loan = data;
      })
  }

  loadSignatoryType() {
    return this.dictionarySvc.loadSignatoryType()
      .then((data)=> {
        this.modalPickSignatory.signatoryTypes = data;
        this.modalPickSignatory.params.type = data[0].value;
        return Promise.resolve(data);
      })
  }

  searchSignatories() {
    this.modalPickSignatory.paginator.reset();
    this.modalPickSignatory.data = [];
    this.querySignatories();
  }

  querySignatories() {
    let query = {
      name: this.modalPickSignatory.params.name || null,
      type: this.modalPickSignatory.params.type
    };
    this.contractEditorSvc.querySignatories(query).then((data)=> {
      this.modalPickSignatory.data = data.items;
      this.modalPickSignatory.paginator.count = data.count;
    });
  }







  openPickSignatoryModal(index: number) {
    this.modalPickSignatory.visible = true;
    this.modalPickSignatory.signatureIndex = index;
    this.loadSignatoryType()
      .then((data)=> {
        this.searchSignatories();
      });
  }

  closePickSignatoryModal() {
    this.modalPickSignatory.visible = false;
  }

  selectSignatory(signatory: Signatory) {
    if (signatory.twUserId !== undefined) {
      let signature = new Signature();
      signature.userId = signatory.twUserId;
      signature.name = signatory.name;
      this.signatures[this.modalPickSignatory.signatureIndex] = signature;
    }
    this.closePickSignatoryModal();
    this.open();
  }

  addNewSignature() {
    let signature = new Signature();
    this.signatures.push(signature);
  }

  removeSignature(index: number) {
    this.signatures.splice(index, 1);
  }



  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  open() {
    this.visible = true;
  }

  submit() {
    if (this.contractTitle === '') {
      this.pop.error({
        text: '请输入合同标题！'
      });
    } else if (this.contractNum === '') {
      this.pop.error({
        text: '请输入合同编号！'
      });
    } else if (this.resourceId === undefined) {
      this.pop.error({
        text: '请选择资方！'
      });
    } else if (this.fileName === ''||this.fileId==='' ) {
      this.pop.error({
        text: '请上传合同文件！'
      });
    } else {
      let signatures = [];
      //验证签章用户
      let valid = true;
      if (this.wouldSign) {
        if (this.signatures.length === 0) {
          this.pop.error({
            text: '请选择签章用户！'
          });
          valid = false;
        }
        if (this.signatures.length === 1 && this.signatures[0].userId === undefined) {
          this.pop.error({
            text: '请选择签章用户！'
          });
          valid = false;
        }
        for (let o of this.signatures) {
          let numRegExp = /^[0-9]+$/;
          if (o.userId !== undefined) {
            let invalid = true;
            if (!o.page && o.page != 0) {
              this.pop.error({
                text: '请输入签章页码！'
              });
            } else if (!numRegExp.test(o.page + '')) {
              this.pop.error({
                text: '签章页码输入有误！'
              });
            } else if (!o.positionX && o.positionX != 0) {
              this.pop.error({
                text: '请输入X坐标！'
              });
            } else if (!o.positionY && o.positionY != 0) {
              this.pop.error({
                text: '请输入Y坐标！'
              });
            } else {
              invalid = false;
            }
            if (invalid) {
              valid = false;
              break;
            }
            signatures.push({
              name:o.name,
              userId: o.userId,
              page: o.page,
              positionX: o.positionX,
              positionY: o.positionY
            });
          }
        }
      }
      if (valid) {
        this.submitted = true;
        let body = {
          borrowApplyId: this.associateId||this.loan.borrowApplyId,
          companyName: this.loan.companyName,
          title: this.contractTitle,
          docNum: this.contractNum,
          capitalId: this.resourceId,
          isSign: this.wouldSign ? 0 : 1,
          fileId:this.fileId,
          fileName: this.fileName,
          signature: this.wouldSign ? signatures : null
        };
        this.contractEditorSvc.createContract(body)
          .then((res)=> {
            this.submitted=false;
            if (res.status) {
              this.pop.info({
                text: '添加合同成功！'
              });
              this.complete.emit();
            } else {
              this.pop.error({
                text: res.message || '添加合同失败！'
              });
            }
            this.close();
          })
          .catch((err)=> {
            this.submitted=false;
            this.pop.error({
              text: '请求失败！'
            });
            this.close();
          });
      }
    }
  }
}


class ContractSignatoryPicker{
  visible:boolean=false;
  data:Contract[]=[];
  svc:ContractEditorService;
  toaster:Toaster=new Toaster();
  params:{
    companyName:string,
    borrowApplyId:string
  }={
    companyName:'',
    borrowApplyId:''
  };
  paginator:Paginator= new Paginator();

  private complete:Function;
  constructor(
    svc:ContractEditorService
  ){
    this.svc=svc;
    this.paginator.size=10;
  }
  resetParams(){
    this.params.companyName='';
    this.params.borrowApplyId='';
  }
  open() {
    this.visible = true;
    this.searchContracts();
  }

  close() {
    this.visible= false;
  }

  searchContracts(){
    this.paginator.reset();
    this.data = [];
    this.queryContracts();
  }
  queryContracts(){
    let query = {
      companyName: this.params.companyName || null,
      borrowApplyId: this.params.borrowApplyId||null,
      page:this.paginator.index+1,
      rows:this.paginator.size
    };
    this.svc.queryContracts(query).then((data)=> {
      this.data = data.items;
      this.paginator.count = data.count;
    });
  }

  onComplete(fn:Function){
    this.complete=fn;
  }

  pick(contractId:string){
      this.svc.queryContractSignatories({
        contractId:contractId
      }).then((res)=>{
        if(res.length>0) {
          this.complete(res);
          this.close();
        }else{
          this.toaster.error('','该合同没有签章用户！');
        }
      });
  }
}
