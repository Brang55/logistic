import { Global, Module } from "@nestjs/common";
import { TomTomClient } from "./tomtom.client";

@Global()
@Module({
  providers: [TomTomClient],
  exports: [TomTomClient],
})
export class TomTomModule {}
