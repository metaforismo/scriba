import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { Stage, StageProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { NetworkStack } from '../lib/network-stack'
import { PlatformStack } from '../lib/platform-stack'
import { ServiceStack } from '../lib/service-stack'
import { SecurityStack } from '../lib/security-stack'
import { ObservabilityStack } from '../lib/observability-stack'
import { SCRIBA_PREFIX } from '../lib/constants'
import { GitHubOidcStack } from '../lib/cicd-stack'

export interface AppStageProps extends StageProps {
  stageName: string
}

export class AppStage extends Stage {
  public readonly stageName: string

  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props)

    this.stageName = props.stageName

    const network = new NetworkStack(this, `${SCRIBA_PREFIX}Network`, {
      env: props.env,
    })

    const platform = new PlatformStack(this, `${SCRIBA_PREFIX}Platform`, {
      env: props.env,
      vpc: network.vpc,
    })

    const service = new ServiceStack(this, `${SCRIBA_PREFIX}Service`, {
      env: props.env,
      vpc: network.vpc,
      dbSecretArn: platform.dbSecretArn,
      dbEndpoint: platform.dbEndpoint,
      serviceRepo: platform.serviceRepo,
      opensearchDomain: platform.opensearchDomain,
      blobStorageBucket: platform.blobStorageBucket,
      timingBucketName: platform.timingBucketName,
    })

    new SecurityStack(this, `${SCRIBA_PREFIX}Security`, {
      env: props.env,
      fargateService: service.fargateService,
      dbSecurityGroupId: platform.dbSecurityGroupId,
    })

    new ObservabilityStack(this, `${SCRIBA_PREFIX}Observability`, {
      env: props.env,
      albFargate: service.albFargate,
    })
  }
}

const app = new cdk.App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

const stages = ['dev', 'prod']
stages.forEach(stageName => {
  new AppStage(app, `${SCRIBA_PREFIX}-${stageName}`, {
    env,
    stageName,
  })
})

new GitHubOidcStack(app, `${SCRIBA_PREFIX}CiCd`, {
  env,
  stages,
})

app.synth()
