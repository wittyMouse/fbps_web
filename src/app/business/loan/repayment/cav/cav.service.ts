import {Injectable} from '@angular/core';
import {MyHttpClient} from '../../../../core/services/myHttp/myhttpClient.service';
@Injectable()
export class CAVService {
  constructor(private myHttp: MyHttpClient) {

  }
}

