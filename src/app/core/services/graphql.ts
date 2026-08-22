import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

interface GraphQlError {
  message: string;
}

interface GraphQlResponse<T> {
  data: T | null;
  errors?: GraphQlError[];
}

@Injectable({ providedIn: 'root' })
export class GraphqlService {
  constructor(private readonly http: HttpClient) {}

  query<T>(query: string, variables?: Record<string, unknown>): Observable<T> {
    return this.http
      .post<GraphQlResponse<T>>(environment.graphqlUrl, { query, variables })
      .pipe(
        map((res) => {
          if (res.errors?.length) {
            throw new Error(res.errors.map((e) => e.message).join('; '));
          }
          return res.data as T;
        }),
      );
  }
}
