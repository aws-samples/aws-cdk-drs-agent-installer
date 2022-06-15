#!/usr/bin/env node
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {DrsAgentInstallerStack} from "../lib/infrastructure/stacks/DrsAgentInstallerStack";
import {OnVolumeAttachEventStack} from "../lib/infrastructure/stacks/OnVolumeAttachEventStack";
import {ArnPrincipal} from "aws-cdk-lib/aws-iam";
import {Aspects, Aws} from "aws-cdk-lib";
import {AwsSolutionsChecks} from "cdk-nag";

const app = new cdk.App();
const documentName = "install-drs-agent"
const tagKeyToMatch = "install-drs-agent"
const tagValuesToMatch = ["true", "TRUE", "True", "1", "T"]
new DrsAgentInstallerStack(app, 'drs-agent-installer', {
    assumeDrsRolePrincipals: [new ArnPrincipal(`arn:aws:iam::${Aws.ACCOUNT_ID}:role/SessionManagerRole`)],
    documentName: documentName,
    documentVersion: "1",
    tagKeyToMatch: tagKeyToMatch,
    tagValuesToMatch: tagValuesToMatch,
    installCheckVolumesScript: true
});

new OnVolumeAttachEventStack(app, "on-attach-volume-event", {
    cloudTrailBucketArn: app.node.tryGetContext("bucket"),
    trailName: app.node.tryGetContext("trailName"),
    documentName: documentName,
    tagKeyToMatch: tagKeyToMatch,
    tagValuesToMatch: tagValuesToMatch
})
Aspects.of(app).add(new AwsSolutionsChecks())