#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {DrsAgentInstallerStack} from "../lib/infrastructure/stacks/DrsAgentInstallerStack";
import {OnVolumeAttachEventStack} from "../lib/infrastructure/stacks/OnVolumeAttachEventStack";
import {ArnPrincipal} from "aws-cdk-lib/aws-iam";
import {Aws} from "aws-cdk-lib";

const app = new cdk.App();
const documentName = "install-drs-agent"
const tagKeyToMatch = "install-drs-agent"
const tagValuesToMatch = ["true", "TRUE", "True", "1", "T"]
new DrsAgentInstallerStack(app, 'drs-agent-installer', {
    assumeDrsRolePrincipals: [new ArnPrincipal(`arn:aws:iam::${Aws.ACCOUNT_ID}:role/SessionManagerRole`)],
    documentName: documentName,
    documentVersion: "1",
    tagKeyToMatch: tagKeyToMatch,
    tagValuesToMatch: tagValuesToMatch
});

new OnVolumeAttachEventStack(app, "on-attach-volume-event", {
    cloudTrailBucketArn: app.node.tryGetContext("bucket"),
    trailName: app.node.tryGetContext("trailName"),
    documentName: documentName,
    tagKeyToMatch: tagKeyToMatch,
    tagValuesToMatch: tagValuesToMatch
})